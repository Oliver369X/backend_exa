-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "assets" JSONB,
ADD COLUMN     "components" JSONB,
ADD COLUMN     "css" TEXT,
ADD COLUMN     "html" TEXT,
ADD COLUMN     "js" TEXT;

-- CreateTable
CREATE TABLE "PasswordRecoveryToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordRecoveryToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "html" TEXT,
    "css" TEXT,
    "components" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ProjectCollaborator" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordRecoveryToken_token_key" ON "PasswordRecoveryToken"("token");

-- CreateIndex
CREATE INDEX "Page_projectId_isDeleted_idx" ON "Page"("projectId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "Page_projectId_clientId_key" ON "Page"("projectId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "_ProjectCollaborator_AB_unique" ON "_ProjectCollaborator"("A", "B");

-- CreateIndex
CREATE INDEX "_ProjectCollaborator_B_index" ON "_ProjectCollaborator"("B");

-- AddForeignKey
ALTER TABLE "PasswordRecoveryToken" ADD CONSTRAINT "PasswordRecoveryToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectCollaborator" ADD CONSTRAINT "_ProjectCollaborator_A_fkey" FOREIGN KEY ("A") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectCollaborator" ADD CONSTRAINT "_ProjectCollaborator_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
