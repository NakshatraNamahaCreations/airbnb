import jwt from "jsonwebtoken";
import { AuthError } from "../utils/error.js";
import User from "../models/user.model.js";
import Admin from "../models/admin.model.js";
import asyncHandler from "./asyncHandler.js";

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ code: "unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      throw new AuthError("User not found");
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ code: 'user_suspended', message: 'Account suspended' });
    }
    if (user.status === 'deleted') {
      return res.status(403).json({ code: 'user_deleted', message: 'Account no longer exists' });
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    console.error("JWT auth error:", error.message);
    return res.status(401).json({
      status: "fail",
      code: "unauthorized",
      message: error.message,
    });
  }
});

const authorizeRoles = (...allowedRoles) => {
  return async (req, res, next) => {
    const hasRole = req.user?.roles?.some((role) => allowedRoles.includes(role));
    if (hasRole) return next();
    return next(new AuthError("Not authorized to access this route"));
  };
};

// Admin-only authenticate middleware
const authenticateAdmin = asyncHandler(async (req, res, next) => {
  const token =
    req.cookies?.jwt ||
    (req.get("authorization")?.startsWith("Bearer ") &&
      req.get("authorization").split(" ")[1]);

  if (!token) {
    return res.status(401).json({ code: 'unauthorized', message: 'No admin token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // FIX: the JWT is signed with `userId` (containing the admin _id), not `adminId`.
    const admin = await Admin.findById(decoded.userId).lean();

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }
    if (admin.status === 'suspended') {
      return res.status(403).json({ code: 'admin_suspended', message: 'Admin account suspended' });
    }

    req.admin = admin;
    req.adminId = admin._id;
    req.adminRole = admin.role;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Authentication failed" });
  }
});

// Restrict to specific admin roles (super_admin, admin, support)
const authorizeAdminRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ code: 'unauthorized' });
    }
    if (allowedRoles.includes(req.admin.role)) return next();
    return res.status(403).json({
      code: 'forbidden',
      message: `Requires one of: ${allowedRoles.join(', ')}`,
    });
  };
};

// Accept either an admin token or a user token.
// - admin token wins if both happen to verify
// - sets req.admin / req.adminId OR req.user / req.userId accordingly
const authenticateAny = asyncHandler(async (req, res, next) => {
  const bearer =
    (req.get("authorization")?.startsWith("Bearer ") &&
      req.get("authorization").split(" ")[1]) || null;
  const token = bearer || req.cookies?.jwt;

  if (!token) {
    return res.status(401).json({ code: "unauthorized", message: "no token" });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ code: "unauthorized", message: err.message });
  }

  // Try admin first
  const admin = await Admin.findById(decoded.userId).lean();
  if (admin) {
    if (admin.status === "suspended") {
      return res.status(403).json({ code: "admin_suspended" });
    }
    req.admin = admin;
    req.adminId = admin._id;
    req.adminRole = admin.role;
    return next();
  }

  // Fall through to user
  const user = await User.findById(decoded.userId);
  if (user) {
    if (user.status === "suspended") {
      return res.status(403).json({ code: "user_suspended" });
    }
    if (user.status === "deleted") {
      return res.status(403).json({ code: "user_deleted" });
    }
    req.user = user;
    req.userId = user._id;
    return next();
  }

  return res.status(401).json({ code: "unauthorized", message: "no matching account" });
});

export { authenticate, authorizeRoles, authenticateAdmin, authorizeAdminRoles, authenticateAny };
