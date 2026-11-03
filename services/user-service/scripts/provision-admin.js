const prisma = require("../src/config/prisma");

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Usage: npm run provision-admin -- <existing-account-email>");
  }

  const user = await prisma.user.update({
    where: { email },
    data: { role: "ADMIN", tokenVersion: { increment: 1 } },
    select: { email: true, role: true },
  });
  process.stdout.write(`Provisioned ${user.email} as ${user.role}. The account must sign in again.\n`);
}

main()
  .catch((error) => {
    if (error.code === "P2025") {
      process.stderr.write("No existing account matches that email. Register as a normal user first.\n");
      process.exitCode = 1;
      return;
    }
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
