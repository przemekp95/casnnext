-- CreateTable
CREATE TABLE `Author` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `img` VARCHAR(255) NOT NULL,
    `bio` TEXT NOT NULL,

    UNIQUE INDEX `Author_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Analysis` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `authorId` INTEGER NOT NULL,

    UNIQUE INDEX `Analysis_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_prisma_migrations` (
    `id` VARCHAR(36) NOT NULL,
    `checksum` VARCHAR(64) NOT NULL,
    `finished_at` DATETIME(3),
    `migration_name` VARCHAR(255) NOT NULL,
    `logs` TEXT,
    `rolled_back_at` DATETIME(3),
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `applied_steps_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Analysis` ADD CONSTRAINT `Analysis_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `Author`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;