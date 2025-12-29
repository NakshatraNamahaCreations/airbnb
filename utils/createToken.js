import jwt from 'jsonwebtoken';

const generateToken = (userId, userRoles, email) => {

  const token = jwt.sign({
    userId,
    userRoles,  // Include user role for authorization in other services
    email,     // Optional, can be helpful in logs or dashboards
  }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });



  return token;
};

const generateAdminToken = (res, adminId, email) => {
  const token = jwt.sign(
    {
      userId: adminId,
      userRoles: "admin",
      email,
    },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );

  res.cookie("jwt", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  return token;
};



export { generateToken, generateAdminToken };
