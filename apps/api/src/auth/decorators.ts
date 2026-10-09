import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@btw/api/types';
import type { Principal } from './principal';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const ROLES = 'roles';
/** Restrict an endpoint to roles (director/admin always pass). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);
export const Me = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => ctx.switchToHttp().getRequest().user);
