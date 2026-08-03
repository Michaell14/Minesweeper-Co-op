/**
 * The two claims lib/authOptions.ts adds to NextAuth's JWT: the OAuth identity
 * pair, stashed at sign-in so app/api/socket-token can put them in the bridge
 * token. Without this augmentation every read of them is an `any` cast.
 */
import 'next-auth/jwt';

declare module 'next-auth/jwt' {
    interface JWT {
        provider?: string;
        providerAccountId?: string;
    }
}
