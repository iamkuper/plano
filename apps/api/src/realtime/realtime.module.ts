import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { RealtimeGateway } from "./realtime.gateway";
import { RealtimeService } from "./realtime.service";

@Global()
@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET ?? "change-me-in-production" })],
  providers: [RealtimeGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
