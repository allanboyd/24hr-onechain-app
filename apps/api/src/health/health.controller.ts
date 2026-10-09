import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators';

@Public()
@Controller('health')
export class HealthController {
  @Get() health() { return { ok: true, service: 'btw-api', time: new Date().toISOString() }; }
}
