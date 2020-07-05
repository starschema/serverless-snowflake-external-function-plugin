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
                console.log(rows[0].status);
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

const deployApiIntegrationAndFunctionsInternal = (state) => {

    describeApiIntegration(state, {
        apiNotFound: createApiIntegration,
        onSuccess: (state, res) => {
            console.log('Successfully executed statement: ', res);

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
                        console.log(result);
                    }
                })
        }
    });

}

const deploySnowflakeFunctions = (state) => {

    const snowflakeConnection = getSnowflakeParameters(state.serverless);

    console.log("Connecting to snowflake", snowflakeConnection);
    var connection = snowflake.createConnection(snowflakeConnection);

    connection.connect(
        function (err, conn) {
            if (err) {
                throw new Error('Unable to connect to Snowflake: ' + err.message);
            } else {
                console.log('Successfully connected to Snowflake.');

                deployApiIntegrationAndFunctionsInternal(
                    _.extend(state, {
                        connection: conn
                    })
                );
            }
        }
    );
}



module.exports = {
    deploySnowflakeFunctions: deploySnowflakeFunctions
}