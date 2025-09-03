import { apiLogger } from '../utils/logger.js';


const developmentRoute = async(req, res, next) => {
  apiLogger.info('developmentRoute ' );
  req.userId = '68afe4a19200e5d00c4e1d81';
  next();
};



export { developmentRoute };
