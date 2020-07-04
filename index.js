'use strict';

import _ from 'lodash';


class ServerlessPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    this.commands = {
      deploy: {
        lifecycleEvents: ['resources', 'functions'],
      },

      finalize: {
        lifecycleEvents: [
          'cleanup',
        ],
      }
    };

    this.hooks = {
      'before:deploy:resources': this.beforeDeployResources,
      'deploy:resources': this.deployResources,
      'after:deploy:deploy': this.afterDeployFunctions.bind(this),
      'before:package:finalize': this.addSnowflakeInvokePermission.bind(this),

      // Deploy finalize inner lifecycle
      'aws:deploy:finalize:cleanup': () => {
        this.setupSnowflake.bind(this)
        this.cleanupS3Bucket
      }
    };
  }

  addSnowflakeInvokePermission() {
    this.serverless.cli.log('Adding permission to Snowflake for invoking API Gateway');

    for (const method of _.values(this.serverless.service.provider.compiledCloudFormationTemplate.Resources)) {
      if(method.Type && method.Type === 'AWS::ApiGateway::Method') {
        method.
      }
    }

    console.log(this.serverless.service.provider.compiledCloudFormationTemplate.Resources);
  }

  beforeDeployResources() {
    console.log('Before Deploy Resources');
  }

  deployResources() {
    console.log('Deploy Resources');
  }


  afterDeployFunctions() {
    this.serverless.cli.log('After Deploy Function');
  }


  setupSnowflake() {
    this.serverless.cli.log('Setting up Snowflake');

  }

}

module.exports = ServerlessPlugin;
