import jwt from "jsonwebtoken";
import { AuthError } from "../utils/error.js";
import User from "../models/user.model.js";
import Admin from "../models/admin.model.js";
import asyncHandler from "./asyncHandler.js";
import { apiLogger } from "../utils/logger.js";

const authenticate = asyncHandler(async (req, res, next) => {
  // console.log('req: ', req);
  // console.log('req.headers: ', req.headers);
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ code: "unauthorized" });
  }

  // const token = req.headers.authorization?.split(' ')[1];        // Extract token
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  if (token) {
    try {
      console.log("process.env.JWT_SECRET", process.env.JWT_SECRET);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await User.findById(decoded.userId);

      if (!user) {
        throw new AuthError("User not found");
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
  } else {
    throw new AuthError("No token provided");
  }
});

const authorizeAdmin = asyncHandler(async (req, res, next) => {
  if (req.user.kycStatus === "verified") {
    next();
  } else {
    throw new AuthError("Not authorized to access this route");
  }
});

const authorizeRoles = (...allowedRoles) => {
  return async (req, res, next) => {
    console.log("allowedRoles: ", allowedRoles);
    console.log("req.user.roles: ", req.user.roles);

    const hasRole = req.user.roles?.some((role) => allowedRoles.includes(role));

    if (hasRole) {
      return next();
    }

    // If no match, throw error
    return next(new AuthError("Not authorized to access this route"));
  };
};

// Admin-only authenticate middleware
const authenticateAdmin = asyncHandler(async (req, res, next) => {
  const token =
    req.cookies?.jwt ||
    (req.get("authorization")?.startsWith("Bearer ") &&
      req.get("authorization").split(" ")[1]);

 

  // const header = req.get('authorization') || '';
  // console.log(`header: `, header);

  // const [scheme, token] = header.split(' ');
  // if (scheme !== 'Bearer' || !token) {
  //   return res.status(401).json({ code: 'unauthorized' });
  // }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(`authenticateAdmin decoded: `, decoded);
    const admin = await Admin.findById(decoded.adminId).lean();
    console.log("admin: ", admin);

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }
    req.admin = admin;
    req.adminId = admin._id;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Authentication failed" });
  }
});

export { authenticate, authorizeAdmin, authorizeRoles, authenticateAdmin };
