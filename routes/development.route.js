const developmentRoute = async (req, res, next) => {
  req.userId = '68afe4a19200e5d00c4e1d81';
  req.headers.authorization = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGFmZTRhMTkyMDBlNWQwMGM0ZTFkODEiLCJ1c2VyUm9sZXMiOiJob3N0IiwiZW1haWwiOiJob3N0LTFAZXhhbXBsZS5jb20iLCJpYXQiOjE3NjI5NDc4MzEsImV4cCI6MTc2NTUzOTgzMX0.vwkvhJWnNu68BgfwJ-BSgnYEnrxAHldu39PeO8mOQM8';
  req.cookies.jwt='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGFmZTRhMTkyMDBlNWQwMGM0ZTFkODEiLCJ1c2VyUm9sZXMiOiJob3N0IiwiZW1haWwiOiJob3N0LTFAZXhhbXBsZS5jb20iLCJpYXQiOjE3NjI5NDc4MzEsImV4cCI6MTc2NTUzOTgzMX0.vwkvhJWnNu68BgfwJ-BSgnYEnrxAHldu39PeO8mOQM8'
  next();
};



export { developmentRoute };
