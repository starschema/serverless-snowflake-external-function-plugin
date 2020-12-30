// BSD 3-Clause License

// Copyright (c) 2020, Starschema Limited
// All rights reserved.

// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:

// 1. Redistributions of source code must retain the above copyright notice, this
//    list of conditions and the following disclaimer.

// 2. Redistributions in binary form must reproduce the above copyright notice,
//    this list of conditions and the following disclaimer in the documentation
//    and/or other materials provided with the distribution.

// 3. Neither the name of the copyright holder nor the names of its
//    contributors may be used to endorse or promote products derived from
//    this software without specific prior written permission.

// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
// FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
// DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
// SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
// CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
// OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


'use strict';

const snowflake = require('snowflake-sdk');
const _ = require('lodash');


/**
* Get Custom Parameters
*
* @returns {*}
*/
const getSnowflakeParameters = (serverless) => {
    return (serverless.service.custom && serverless.service.custom.snowflake) || {};
}

const getCleanName = (str) => {
    return str.toUpperCase().replace(/\-/g,'_');
}

const createApiIntegration = (state) => {
    state.connection.execute({
        sqlText: `create or replace api integration ${getCleanName(state.stackName)}
                    api_provider = aws_api_gateway
                    api_aws_role_arn = '${state.iamRoleArn}'  
                    enabled = true
                    api_allowed_prefixes = ('${state.endpoint}');`,
        complete: function (err, stmt, rows) {
            if (err) {
                throw new Error('Failed to create snowflake api integration due to the following error: ' + err.message);
            } else {
                // the integration is ready, we can go back and describe it
                state.serverless.cli.log(rows[0].status, 'Snowflake');
                deployApiIntegrationAndFunctionsInternal(state);
            }
        }
    });

}

const describeApiIntegration = (state, callbacks) => {
    state.connection.execute({
        sqlText: `describe integration ${getCleanName(state.stackName)}`,
        complete: function (err, stmt, rows) {
            if (err) {
                if (err.code === '002003') {
                    callbacks.apiNotFound(state);
                } else {
                    throw new Error(`Cannot DESCRIBE integration ${getCleanName(state.stackName)}` + err.message);
                }
            } else {
                callbacks.onSuccess(state, rows);
            }
        }
    });

}

const createOrReplaceFunction = (state, func) => {
    const functionData = state.serverless.service.functions[func].snowflake;
    const path = state.serverless.service.functions[func].events[0].http.path;

    state.connection.execute({
        sqlText: `create or replace external function ${getCleanName(func)}${functionData.argument_signature}
        returns ${functionData.data_type}
        api_integration = ${getCleanName(state.stackName)}
        COMPRESSION = none
        as '${state.endpoint}/${path}'`,
        complete: function (err, stmt, rows) {
            if (err) {
                throw new Error(`Cannot create function ${getCleanName(func)}` + err.message);
            } else {
                state.serverless.cli.log(`Created or replaced external function ${getCleanName(func)}`, 'Snowflake');
            }
        }
    });

}

const deployApiIntegrationAndFunctionsInternal = (state) => {

    describeApiIntegration(state, {
        apiNotFound: createApiIntegration,
        onSuccess: (state, res) => {
            // TODO: append instead of overwrite assume role policy rules
            state.provider
                .request('IAM', 'updateAssumeRolePolicy',
                    {
                        PolicyDocument: JSON.stringify(
                            {
                                "Version": "2012-10-17",
                                "Statement": [
                                    {
                                        "Effect": "Allow",
                                        "Principal": {
                                            "AWS": _.find(res, { property: 'API_AWS_IAM_USER_ARN' }).property_value
                                        },
                                        "Action": "sts:AssumeRole",
                                        "Condition": {
                                            "StringEquals":
                                                { "sts:ExternalId": _.find(res, { property: 'API_AWS_EXTERNAL_ID' }).property_value }
                                        }
                                    },
                                    {
                                        "Effect": "Allow",
                                        "Principal": {
                                            "Service": "lambda.amazonaws.com"
                                        },
                                        "Action": "sts:AssumeRole"
                                    }
                                ]
                            }
                        ),
                        RoleName: state.iamRoleArn.substr(state.iamRoleArn.indexOf('/')+1)
                    })
                .then(result => {
                    if (result) {
                        for (const func of state.serverless.service.getAllFunctions()) {
                            createOrReplaceFunction(state,func);
                        }
                    }
                })
        }
    });

}

const withSnowflakeConnection = (state,callback) => {
    const snowflakeConnection = getSnowflakeParameters(state.serverless);
    var connection = snowflake.createConnection(snowflakeConnection);

    connection.connect(
        function (err, conn) {
            if (err) {
                throw new Error('Unable to connect to Snowflake: ' + err.message);
            } else {
               callback(
                   _.extend(state, {
                       connection: conn
                   })
               ); 
            }
        }
    );
}

const deploySnowflakeFunctions = (state) => {

    // Connnect to snowflake
    withSnowflakeConnection(state, (state_with_connection) => { 
        // Deploy API and all Functions
        deployApiIntegrationAndFunctionsInternal(state_with_connection);
    });
}

const dropFunction = (state,func) => {
    const functionData = state.serverless.service.functions[func].snowflake;
    const regex = /\w+\s+(\w+)/gm;
    const subst = `$1`;
    const function_args_only = functionData.argument_signature.replace(regex, subst);

    state.connection.execute({
        sqlText: `drop function ${getCleanName(func)}${function_args_only}`,
        complete: function (err, stmt, rows) {
            if (err) {
                throw new Error(`Cannot drop function ${getCleanName(func)}` + err.message);
            } else {
                state.serverless.cli.log(`Dropped external function ${getCleanName(func)}`, 'Snowflake');
            }
        }
    });    
}

const removeSnowflakeFunctions = (state) => {

    // Connnect to snowflake
    withSnowflakeConnection(state, (state) => { 
        // remove all functions and api integration
        state.connection.execute({
            sqlText: `drop integration if exists ${getCleanName(state.stackName)} cascade`,
            complete: function (err, stmt, rows) {
                if (err) {
                    throw new Error(`Cannot create drop integration ${getCleanName(state.stackName)}` + err.message);
                } else {
                    state.serverless.cli.log(`Dropped api integration ${getCleanName(state.stackName)}`, 'Snowflake');
                    for (const func of state.serverless.service.getAllFunctions()) {
                        dropFunction(state,func);
                    }    
                }
            }
        });
    });
}



module.exports = {
    deploySnowflakeFunctions: deploySnowflakeFunctions,
    removeSnowflakeFunctions: removeSnowflakeFunctions
}