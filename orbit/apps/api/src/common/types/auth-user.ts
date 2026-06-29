import { Role } from '@prisma/client';

/** The decoded JWT subject attached to the request as `req.user`. */
export interface AuthUser {
  sub: string; // user id
  email: string;
  role: Role;
  roId: string | null;
}
