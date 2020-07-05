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

const _ = require('lodash');
const BbPromise = require('bluebird');

const snowflake = require('./snowflake');

class ServerlessPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    this.commands = {
      deploy: {
        lifecycleEvents: ['resources', 'functions'],
      }

    };

    this.hooks = {
      'after:deploy:deploy': this.afterDeployFunctions.bind(this),
      'before:package:finalize': this.addSnowflakeInvokePermission.bind(this),

    };
  }

 
  getStage() {
    return this.serverless.variables.options.stage || this.serverless.service.provider.stage;
  }

  addSnowflakeInvokePermission() {
    this.serverless.cli.log('Adding permission to Snowflake for invoking API Gateway');

    for (const restApi of _.values(this.serverless.service.provider.compiledCloudFormationTemplate.Resources)) {
      if (restApi.Type && restApi.Type === 'AWS::ApiGateway::RestApi') {
        // TODO: append policy instead of overwrite
        console.log("prev policy", restApi.Properties.Policy);

        restApi.Properties.Policy = {
          "Version": "2012-10-17",
          "Statement":
            [
              {
                "Effect": "Allow",
                "Principal":
                {
                  "AWS": {
                    "Fn::Join": [
                      "",
                      [
                        "arn:",
                        {
                          "Ref": "AWS::Partition"
                        },
                        ":sts::",
                        {
                          "Ref": "AWS::AccountId"
                        },
                        ":assumed-role/",
                        {
                          "Ref": "IamRoleLambdaExecution"
                        },
                        "/snowflake"
                      ]
                    ]
                  }

                },
                "Action": "execute-api:Invoke",
                "Resource": {
                  "Fn::Join": [
                    "",
                    [
                      "arn:",
                      {
                        "Ref": "AWS::Partition"
                      },
                      ":execute-api:",
                      {
                        "Ref": "AWS::Region"
                      },
                      ":",
                      {
                        "Ref": "AWS::AccountId"
                      },
                      ":/", // We can add the RestApi id here
                      this.getStage(),
                      "/POST"
                    ]
                  ]
                }
              }
            ]
        }
      }
    }
    console.log("Added policy snowflake policy to RestApi");

    this.serverless.service.provider.compiledCloudFormationTemplate.Outputs["IamRoleLambdaExecutionArn"] = {
      "Value": {
        "Fn::GetAtt": [
          "IamRoleLambdaExecution",
          "Arn"
        ]
      }
    }

  }


  afterDeployFunctions() {
    this.serverless.cli.log('Deploying Snowflake API and Functions');

    const stackName = this.provider.naming.getStackName();

    this.provider
      .request('CloudFormation', 'describeStacks', { StackName: stackName })
      .then(result => {
        if (result) {
          const stackOutput = result.Stacks[0].Outputs;
          const endpoint = _.find(stackOutput, { OutputKey: 'ServiceEndpoint' });
          const iamRoleArn = _.find(stackOutput, { OutputKey: 'IamRoleLambdaExecutionArn' });

          // Deploy API Integration Object and functions in Snowflake
          snowflake.deploySnowflakeFunctions({
            serverless: this.serverless, 
            stackName: stackName, 
            provider: this.provider,
            endpoint: endpoint.OutputValue,
            iamRoleArn: iamRoleArn.OutputValue
          });

        }
      });
  }
}

module.exports = ServerlessPlugin;
