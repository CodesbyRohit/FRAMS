import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a resolver/controller as accessible without a JWT (onboarding, login). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
