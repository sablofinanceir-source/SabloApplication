const mongoose = require('mongoose');

const OPTS = {
  bufferCommands: false,
  maxPoolSize: 3,
  minPoolSize: 0,
  serverSelectionTimeoutMS: 3000,
  connectTimeoutMS: 3000,
  socketTimeoutMS: 15000,
  maxIdleTimeMS: 8000,
  heartbeatFrequencyMS: 5000,
  family: 4,
};

global._sabloDb = global._sabloDb || { promise: null };
const state = global._sabloDb;

mongoose.connection.on('disconnected', () => { state.promise = null; });
mongoose.connection.on('error', (e) => {
  console.error('MongoDB error:', e.message);
  state.promise = null;
});

const connectDB = async (budgetMs = 8000) => {
  if (mongoose.connection.readyState === 1) return mongoose;

  const start = Date.now();
  let attempt = 0;
  let lastErr;

  while (Date.now() - start < budgetMs) {
    try {
      if (!state.promise) {
        state.promise = mongoose.connect(process.env.MONGODB_URI, OPTS);
      }
      await state.promise;
      if (mongoose.connection.readyState === 1) return mongoose;
    } catch (err) {
      lastErr = err;
      state.promise = null;
      await mongoose.disconnect().catch(() => {});
      await new Promise((r) => setTimeout(r, 250 * ++attempt));
    }
  }

  console.error('MongoDB Connection Failed:', lastErr && lastErr.message);
  throw lastErr || new Error('DB connect timeout');
};

module.exports = connectDB;
