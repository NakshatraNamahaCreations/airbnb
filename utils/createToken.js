import jwt from 'jsonwebtoken';

const generateToken = (userId, userRoles, email) => {
  const token = jwt.sign({
    userId,
    userRoles,  // Include user role for authorization in other services
    email,     // Optional, can be helpful in logs or dashboards
  }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });

  // // Set JWT as an HTTP-Only Cookie
  // res.cookie('jwt', token, {
  //   httpOnly: true,
  //   secure: process.env.NODE_ENV !== 'development',
  //   sameSite: 'strict',
  //   maxAge: 30 * 24 * 60 * 60 * 1000,
  // });

  return token;
};

export { generateToken };
