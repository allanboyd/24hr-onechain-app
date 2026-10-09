import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from './ports';

/** Marks a handler as reachable without a user session (webhooks, signed file links, dev tools). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
