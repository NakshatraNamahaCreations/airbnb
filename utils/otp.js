import bcrypt from "bcryptjs"

const generateOTP = (len = 6) => {
  // 6-digit numeric
  const min = Math.pow(10, len - 1);
  const max = Math.pow(10, len) - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

const hashOTP = async (otp) => {
  const saltRounds = 10;
  return bcrypt.hash(otp, saltRounds);
}

const verifyOTP = async (otp, hash) => {
  return bcrypt.compare(otp, hash);
}

export { generateOTP, hashOTP, verifyOTP };
