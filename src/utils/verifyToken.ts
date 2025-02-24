import jwt from 'jsonwebtoken';

interface VerifyTokenResult {
  valid: boolean;
  expired: boolean;
  decoded: any | null;
}

const verifyToken = async (token: string): Promise<VerifyTokenResult> => {
  try {
    // Verify the token using JWT_SECRET
    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, process.env.JWT_SECRET!, (err, decoded) => {
        if (err) {
          return reject(err);
        }
        resolve(decoded);
      });
    });
    return { valid: true, expired: false, decoded };
  } catch (error: any) {
    // If token is expired
    if (error.name === 'TokenExpiredError') {
      return { valid: false, expired: true, decoded: null };
    }

    // If token is invalid
    return { valid: false, expired: false, decoded: null };
  }
};

export default verifyToken;
