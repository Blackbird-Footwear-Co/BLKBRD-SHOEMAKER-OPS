import type { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
  user?: any;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  req.user = {
    uid: 'crm3-admin',
    email: 'crm3.blkbrdshoemaker@gmail.com'
  };
  next();
};
