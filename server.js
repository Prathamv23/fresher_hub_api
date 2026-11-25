const jsonServer = require('json-server');
const { Octokit } = require('@octokit/rest');

const server = jsonServer.create();
const middlewares = jsonServer.defaults();

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const OWNER = 'Prathamv23';
const REPO = 'fresher_hub_api';
const FILE_PATH = 'db.json';
const BRANCH = 'main';

async function startServer() {
  try {
    // 1. Load the latest db.json from GitHub on startup
    const { data } = await octokit.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path: FILE_PATH,
      ref: BRANCH,
    });

    let currentSha = data.sha;
    const initialDb = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
    const router = jsonServer.router(initialDb);

    server.use(middlewares);
    server.use(jsonServer.bodyParser);

    // 2. Push changes to GitHub whenever data is modified
    server.use((req, res, next) => {
      res.on('finish', async () => {
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && res.statusCode < 400) {
          try {
            const updatedContent = JSON.stringify(router.db.getState(), null, 2);

            const response = await octokit.repos.createOrUpdateFileContents({
              owner: OWNER,
              repo: REPO,
              path: FILE_PATH,
              branch: BRANCH,
              message: `Auto-update db.json (${req.method} ${req.originalUrl})`,
              content: Buffer.from(updatedContent).toString('base64'),
              sha: currentSha,
            });

            currentSha = response.data.content.sha;
            console.log(`Synced ${req.method} ${req.originalUrl} to GitHub`);
          } catch (err) {
            console.error('GitHub sync error:', err.message);
          }
        }
      });
      next();
    });

    server.use(router);

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();
