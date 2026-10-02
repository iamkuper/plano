import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { ProjectsModule } from "./projects/projects.module";
import { BoardsModule } from "./boards/boards.module";
import { CardsModule } from "./cards/cards.module";
import { TemplatesModule } from "./templates/templates.module";
import { SettingsModule } from "./settings/settings.module";
import { RolesModule } from "./roles/roles.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { ReportsModule } from "./reports/reports.module";
import { RecurringModule } from "./recurring/recurring.module";
import { AttachmentsModule } from "./attachments/attachments.module";
import { BillingModule } from "./billing/billing.module";
import { MailModule } from "./mail/mail.module";
import { LabelsModule } from "./labels/labels.controller";
import { InvitationsModule } from "./invitations/invitations.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    BoardsModule,
    CardsModule,
    TemplatesModule,
    SettingsModule,
    RolesModule,
    RealtimeModule,
    NotificationsModule,
    ReportsModule,
    RecurringModule,
    AttachmentsModule,
    BillingModule,
    MailModule,
    LabelsModule,
    InvitationsModule,
  ],
})
export class AppModule {}
