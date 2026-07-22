import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class WebJwtAuthGuard extends AuthGuard('web-jwt') {}
