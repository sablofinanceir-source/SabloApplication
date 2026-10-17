const mongoose = require('mongoose');

const OPTS = {
  bufferCommands: false,
  maxPoolSize: 5,
  minPoolSize: 0,
  serverSelectionTimeoutMS: 8000,
  connectTimeoutMS: 8000,
  socketTimeoutMS: 20000,
  maxIdleTimeMS: 30000,
  family: 4,
};

global._sabloDb = global._sabloDb || { promise: null };
const state = global._sabloDb;

mongoose.connection.on('disconnected', () => { state.promise = null; });
mongoose.connection.on('error', (e) => console.error('MongoDB error:', e.message));

const connectDB = async (budgetMs = 12000) => {
  const start = Date.now();
  let lastErr;

  while (Date.now() - start < budgetMs) {
    if (mongoose.connection.readyState === 1) return mongoose;

    const p = state.promise || (state.promise = mongoose.connect(process.env.MONGODB_URI, OPTS));
    try {
      await p;
      if (mongoose.connection.readyState === 1) return mongoose;
    } catch (err) {
      lastErr = err;
      if (state.promise === p) state.promise = null; // فقط اگه هنوز همون promise باشه
      console.error('MongoDB attempt failed:', err.name, '-', err.message);
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  throw lastErr || new Error('DB connect timeout');
};

module.exports = connectDB;
