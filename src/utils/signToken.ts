import jwt from 'jsonwebtoken';

const signToken = (id: string): string => {
  return jwt.sign(
    { id },
    process.env.JWT_SECRET! as jwt.Secret,
    {
      expiresIn: process.env.JWT_EXPIRES_IN!,
    } as jwt.SignOptions
  );
};

export default signToken;
