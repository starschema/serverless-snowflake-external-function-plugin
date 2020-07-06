# Snowflake External Function Serverless Plugin

[Serverless](http://serverless.com/) Plugin for deploying [Snowflake External Functions](https://docs.snowflake.com/en/sql-reference/external-functions-creating-aws.html) to Amazon Web Services (AWS). 

The plugin supports all serverless programming languages including javascript, python, java, scala, clojure, haskell or rust. 

## Usage

To install the plugin, simply install it from the central npm repository:

```
npm install --save serverless-snowflake-external-function-plugin
```

Then add `serverless-snowflake-external-function-plugin` to your `serverless.yml`'s `plugins` section:

```yaml
plugins:
  - serverless-snowflake-external-function-plugin
```

### Starting new project from Serverless Snowflake template (Node)

In case you start the external function development from the beginning, the best and easiest way is to use `snowflake-aws-external-function` template:

```
serverless create --template-url https://github.com/starschema/snowflake-aws-external-function -p hello-function
cd hello-function
npm install serverless-snowflake-external-function-plugin
vim serverless.yml # edit snowflake section
vim handler.js # change handler implementation
serverless deploy
```

This video shows how to deploy your code:

[![asciicast](https://asciinema.org/a/iVExTpsWpETH0Lh8tl0ByDmVy.svg)](https://asciinema.org/a/iVExTpsWpETH0Lh8tl0ByDmVy)


## Deployed objects

The `sls deploy` function creates one `api integration` snowflake object for your project (equals to your service name) and one `external function` for each serverless function handler in `serverless.yml`. 

`sls remove` will remove all api and function snowflake objects. 

## License

BSD-3-Clause. 

(C) Tamas Foldi, Starschema.

