import type { PrismaService } from "../prisma/prisma.service";

// The workspace's default task type; cards created without one get it.
export async function defaultTaskTypeId(prisma: PrismaService): Promise<string> {
  const type = await prisma.taskType.findFirstOrThrow({ where: { isDefault: true }, select: { id: true } });
  return type.id;
}
