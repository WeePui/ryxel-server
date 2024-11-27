const jwt = require('jsonwebtoken');
const { promisify } = require('util');

const verifyToken = async (token) => {
  try {
    // Verify the token using JWT_SECRET
    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
    return { valid: true, expired: false, decoded };
  } catch (error) {
    // If token is expired
    if (error.name === 'TokenExpiredError') {
      return { valid: false, expired: true, decoded: null };
    }

    // If token is invalid
    return { valid: false, expired: false, decoded: null };
  }
};

module.exports = verifyToken;
