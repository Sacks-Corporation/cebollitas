import { Controller, HttpCode, Post } from '@nestjs/common';
import { createAccessToken } from '../../common/auth/tokens';
import { httpError } from '../../common/http-errors';
import { pyModel, pyStr } from '../../common/validation/py-schema';
import { ValidateRequest, VBody } from '../../common/validation/request-validation';
import { serializeUser } from '../users/users.schemas';
import { AuthService } from './auth.service';

const AuthGoogleRequest = pyModel({ token: pyStr() }, { name: 'AuthGoogleRequest' });

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('google')
  @HttpCode(200)
  @ValidateRequest({ body: AuthGoogleRequest })
  async loginWithGoogle(@VBody() payload: { token: string }) {
    let email: string;
    try {
      email = await this.auth.verifyGoogleToken(payload.token);
    } catch {
      throw httpError(401, 'No pudimos validar tu cuenta de Google.');
    }

    const user = await this.auth.findUserByEmail(email);
    if (!user) throw httpError(403, 'Tu cuenta no está autorizada para acceder a Cebollitas Oficial.');

    const token = createAccessToken({ userId: user.id, email: user.email, name: user.name });
    return { token, user: serializeUser(user) };
  }
}
