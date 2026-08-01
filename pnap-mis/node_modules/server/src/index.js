const env = require('./config/env');
const { connectDB } = require('./config/db');
const app = require('./app');

(async () => {
  try {
    await connectDB();
    app.listen(env.PORT, () => {
      console.log(`[server] listening on http://localhost:${env.PORT}`);
    });
  } catch (err) {
    console.error('\n[server] FAILED TO START');
    console.error(`[server] reason: ${err.message}`);
    if (err.name === 'MongooseServerSelectionError' || err.name === 'MongoNetworkError') {
      console.error(`[server] MongoDB at ${env.MONGO_URI} is not reachable.`);
      console.error('[server] start it with one of:');
      console.error('[server]   - net start MongoDB           (Windows service)');
      console.error('[server]   - mongod --dbpath <path>       (manual)');
      console.error('[server]   - docker run -p 27017:27017 mongo:7');
    }
    process.exit(1);
  }
})();
