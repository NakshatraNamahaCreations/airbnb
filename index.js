import express from 'express';
import dotenv from 'dotenv/config';
import cookieParser from 'cookie-parser';
import { connectDB } from './config/db.js';
import cors from 'cors';
import { apiLogger } from './utils/logger.js';
import morgan from 'morgan';
import compression from 'compression';
import { NotFoundError } from './utils/error.js';
import { developmentRoute } from './routes/development.route.js';
import registerRoutes from './routes/index.js';

const PORT = process.env.PORT || 9000;

await connectDB();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(compression());
app.use(morgan('dev'));

app.use(cors({
  origin: function(origin, callback) {
    const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5500'];

    if (process.env.FRONTEND_URLS) {
      const envOrigins = process.env.FRONTEND_URLS
        .split(',')
        .map((url) => url.trim());

      allowedOrigins.push(...envOrigins);
    }

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(developmentRoute);

// routes
registerRoutes(app);

app.get('/', (req, res) => {
  return res.status(200).json({ message: 'Hello from air-bnb clone v1' });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res) => {
  throw new NotFoundError(`Cannot ${req.method} ${req.originalUrl}`);
});

app.use((err, req, res, next) => {
  console.log(`inside global err() -> err: ${JSON.stringify(err)}`);
  console.log('err msg: ', err.message);
  if (req.timedout) {
    apiLogger.info('Request timed out');
    err.message = 'Request timed out ***';
  }

  if (!err) {
    err = new Error('Internal server error');
    err.statusCode = 500;
    err.status = 'error';
  }

  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  res.status(err.statusCode).json({
    code: err.code,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
