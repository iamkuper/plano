import { Global, Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { DueRemindersService } from "./due-reminders.service";
import { NotificationMailer } from "./notification-mailer";

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationMailer, DueRemindersService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
