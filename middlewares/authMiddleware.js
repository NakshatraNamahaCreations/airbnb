import jwt from 'jsonwebtoken';
import { AuthError } from '../utils/error.js';
import User from '../models/user.model.js';
import asyncHandler from './asynchandler.js';

const authenticate = asyncHandler(async(req, res, next) => {
  console.log('Hello ' );
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ code: 'unauthorized' });
  }


  // const token = req.headers.authorization?.split(' ')[1];        // Extract token
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);

      if (!user) {
        throw new AuthError('User not found');
      }

      req.user = user;
      req.userId = user._id;
      console.log('user toJSON: ', user.toJSON());
      next();
    } catch (error) {
      throw new AuthError('Authentication failed');
    }
  } else {
    throw new AuthError('No token provided');
  }
});

const authorizeAdmin = asyncHandler(async(req, res, next) => {
  if (req.user.kycStatus === 'verified') {
    next();
  } else {
    throw new AuthError('Not authorized to access this route');
  }
});

const authorizeRoles = (...allowedRoles) => {
  return (async(req, res, next) => {
    if (allowedRoles.includes(req.user.roles)) {
      next();
    } else {
      throw new AuthError('Not authorized to access this route');
    }
  });
};

export { authenticate, authorizeAdmin, authorizeRoles };
