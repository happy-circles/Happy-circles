const root = 'C:/Users/Samuel/AppData/Local/npm-cache/_npx/ffe3be92ad2bfa4d/node_modules/eas-cli/build';
const SessionManager = require(`${root}/user/SessionManager`).default;
const manager = new SessionManager({ setActor() {} });
const authInfo = { accessToken: manager.getAccessToken(), sessionSecret: manager.getSessionSecret() };
const client = require(`${root}/commandUtils/context/contextUtils/createGraphqlClient`).createGraphqlClient(authInfo);
const query = require(`${root}/graphql/queries/SubmissionQuery`).SubmissionQuery;
query.byIdAsync(client, 'cb74b362-1365-41eb-ba2f-2be9c6469f8e', { useCache: false })
  .then((submission) => console.log(JSON.stringify({ status: submission.status, error: submission.error, logFiles: submission.logFiles })))
  .catch((error) => { console.error(error.message); process.exitCode = 1; });
