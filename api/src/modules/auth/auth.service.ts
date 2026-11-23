import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { getEnv, getEnvOr } from '../../config/env';
import { DataStoreService, Dict } from '../../persistence/data-store.service';

/** Port of `services/auth_service.py` (token creation lives in common/auth/tokens.ts). */
@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client();

  constructor(private readonly store: DataStoreService) {}

  /** Returns the email of a verified Google ID token (or of a `mock:` token in dev). */
  async verifyGoogleToken(token: string): Promise<string> {
    const allowMockAuth = getEnvOr('ALLOW_MOCK_AUTH', 'true').toLowerCase() === 'true';
    if (allowMockAuth && token.startsWith('mock:')) return token.slice('mock:'.length);

    const googleClientId = getEnv('GOOGLE_CLIENT_ID');
    if (!googleClientId) throw new Error('Google client id is not configured.');

    const ticket = await this.googleClient.verifyIdToken({ idToken: token, audience: googleClientId });
    const email = ticket.getPayload()?.email;
    if (!email) throw new Error('Google token does not include an email.');
    return email;
  }

  async findUserByEmail(email: string): Promise<Dict | undefined> {
    const users = await this.store.getAllowedUsers();
    return users.find((user) => String(user.email).toLowerCase() === email.toLowerCase());
  }
}
