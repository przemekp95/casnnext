import { MigrationInterface, QueryRunner } from "typeorm";

export class FixAnalysesData1768119419753 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Fix Analysis table data consistency and relationships

        // 1. Ensure all analyses have valid author relationships
        // First, get all valid author IDs
        const validAuthors = await queryRunner.query(`
            SELECT id, slug FROM \`Author\` WHERE id IS NOT NULL
        `);

        const authorMap = new Map();
        validAuthors.forEach((author: { slug: string; id: number }) => {
            authorMap.set(author.slug, author.id);
        });

        // 2. Update authorId based on slug mappings for known analyses
        const analysisUpdates = [
            { slug: 'wot-balcerowski', authorSlug: 'balcerowski' },
            { slug: 'balcerowski-wegry', authorSlug: 'balcerowski' },
            { slug: 'balcerowski-nacjonalizm', authorSlug: 'balcerowski' },
            { slug: 'kochman-artykul', authorSlug: 'kochman' },
            { slug: 'kochman-epbd', authorSlug: 'kochman' },
            { slug: 'rosolowski-energetyka', authorSlug: 'rosolowski' },
            { slug: 'rosolowski-atom', authorSlug: 'rosolowski' },
            { slug: 'domanska-artykul', authorSlug: 'domanska' },
            { slug: 'luczuk-artykul', authorSlug: 'luczuk' },
            { slug: 'slad-luczuk', authorSlug: 'luczuk' },
            { slug: 'okolowski-artykul', authorSlug: 'okolowski' },
            { slug: 'wos-artykul', authorSlug: 'wos' },
            { slug: 'bruszewski-artykul', authorSlug: 'bruszewski' },
            { slug: 'gursztyn-artykul', authorSlug: 'gursztyn' },
            { slug: 'rutke-artykul', authorSlug: 'rutke' },
            { slug: 'kita-artykul', authorSlug: 'kita' },
            { slug: 'bochenek-artykul', authorSlug: 'bochenek' },
            { slug: 'horoszko-artykul', authorSlug: 'horoszko' },
            { slug: 'trochanowska-artykul', authorSlug: 'trochanowska' },
            { slug: 'feszler-tsue', authorSlug: 'feszler' },
            { slug: 'pietr-artykul', authorSlug: 'pietr' },
            { slug: 'rak-artykul', authorSlug: 'rak' },
            { slug: 'rowinski-artykul', authorSlug: 'rowinski' },
            { slug: 'dakowski-artykul', authorSlug: 'dakowski' },
            { slug: 'trabinski-artykul', authorSlug: 'trabinski' },
            { slug: 'giera-artykul', authorSlug: 'giera' },
            { slug: 'lewandowski-sedziowie', authorSlug: 'lewandowski' },
            { slug: 'kochan-artykul', authorSlug: 'kochan' },
            { slug: 'swietlik-artykul', authorSlug: 'swietlik' },
            { slug: 'ratynski-artykul', authorSlug: 'ratynski' },
            { slug: 'balcerowski-mlodziez', authorSlug: 'balcerowski' },
            { slug: 'lempicka-artykul', authorSlug: 'lempicka-wyszynska' },
            { slug: 'siemiatkowski-artykul', authorSlug: 'siemiatkowski' },
            { slug: 'musial-artykul', authorSlug: 'musial' },
            { slug: 'gorka-artykul', authorSlug: 'gorka' },
            { slug: 'szymanski-artykul', authorSlug: 'szymanski' },
            { slug: 'masior-artykul', authorSlug: 'masior' },
            { slug: 'pietrzak-artykul', authorSlug: 'pietrzak' },
            { slug: 'feszler-artykul', authorSlug: 'feszler' },
        ];

        // Update author relationships
        for (const update of analysisUpdates) {
            const authorId = authorMap.get(update.authorSlug);
            if (authorId) {
                await queryRunner.query(`
                    UPDATE \`Analysis\`
                    SET \`authorId\` = ?
                    WHERE \`slug\` = ?
                `, [authorId, update.slug]);
            }
        }

        // 3. Remove analyses with invalid author relationships
        await queryRunner.query(`
            DELETE FROM \`Analysis\`
            WHERE \`authorId\` NOT IN (SELECT id FROM \`Author\`)
        `);

        // 4. Ensure all analyses have valid data
        await queryRunner.query(`
            UPDATE \`Analysis\`
            SET \`title\` = TRIM(\`title\`)
            WHERE \`title\` IS NOT NULL
        `);

        // 5. Add any missing analyses that should exist
        const missingAnalyses = [
            {
                title: 'Polska suwerenno[ informacyjna a social media',
                slug: 'luczuk-artykul',
                authorSlug: 'luczuk'
            },
            {
                title: 'Jak dBugi cyfrowy [lad po sobie zostawiamy',
                slug: 'slad-luczuk',
                authorSlug: 'luczuk'
            },
            {
                title: 'Autorytety a mBodzie|',
                slug: 'balcerowski-mlodziez',
                authorSlug: 'balcerowski'
            },
            {
                title: 'Spieszmy si rodzi ludzi..."',
                slug: 'lempicka-artykul',
                authorSlug: 'lempicka-wyszynska'
            },
            {
                title: 'Idea piastowska  tezy do dyskusji',
                slug: 'siemiatkowski-artykul',
                authorSlug: 'siemiatkowski'
            },
            {
                title: 'Polska poezja patriotyczna',
                slug: 'musial-artykul',
                authorSlug: 'musial'
            },
            {
                title: 'Zagro|enie wolno[ci sBowa',
                slug: 'gorka-artykul',
                authorSlug: 'gorka'
            },
            {
                title: 'Legislacyjne propozycje zmian',
                slug: 'szymanski-artykul',
                authorSlug: 'szymanski'
            },
            {
                title: 'Samorzd zawodowy',
                slug: 'masior-artykul',
                authorSlug: 'masior'
            },
            {
                title: 'Rola spoBeczeDstwa obywatelskiego',
                slug: 'pietrzak-artykul',
                authorSlug: 'pietrzak'
            },
        ];

        for (const analysis of missingAnalyses) {
            const authorId = authorMap.get(analysis.authorSlug);
            if (authorId) {
                // Check if analysis already exists
                const existing = await queryRunner.query(`
                    SELECT id FROM \`Analysis\` WHERE \`slug\` = ?
                `, [analysis.slug]);

                if (existing.length === 0) {
                    await queryRunner.query(`
                        INSERT INTO \`Analysis\` (\`title\`, \`slug\`, \`authorId\`)
                        VALUES (?, ?, ?)
                    `, [analysis.title, analysis.slug, authorId]);
                }
            }
        }

        // 6. Update titles for existing analyses to ensure they match expected format
        const titleUpdates = [
            { slug: 'wot-balcerowski', title: 'Wojska Obrony Terytorialnej (WOT) w latach 2016-2022' },
            { slug: 'balcerowski-wegry', title: 'Czy Polacy potrzebuj biaBo-czerwonego Orbana?' },
            { slug: 'balcerowski-nacjonalizm', title: 'O pojciu Nacjonalizm' },
            { slug: 'kochman-artykul', title: 'Rozwój otoczenia instytucjonalnego polityki mBodzie|owej' },
            { slug: 'kochman-epbd', title: 'WpByw nowelizacji dyrektywy EPBD' },
            { slug: 'rosolowski-energetyka', title: 'Zielona zmiana w polskiej energetyce' },
            { slug: 'rosolowski-atom', title: 'Polski atom  pitna[cie lat wahaD' },
            { slug: 'domanska-artykul', title: 'Raport dotyczcy badania to|samo[ci wspólnotowej' },
            { slug: 'luczuk-artykul', title: 'Polska suwerenno[ informacyjna a social media' },
            { slug: 'slad-luczuk', title: 'Jak dBugi cyfrowy [lad po sobie zostawiamy' },
            { slug: 'okolowski-artykul', title: 'Dwa modele uniwersytetu' },
            { slug: 'wos-artykul', title: 'Solidarno[ 2023' },
            { slug: 'bruszewski-artykul', title: 'Rozwój SiB Zbrojnych RP' },
            { slug: 'gursztyn-artykul', title: 'Pora|ki polskiej polityki wschodniej' },
            { slug: 'rutke-artykul', title: 'Europa murami podzielona' },
            { slug: 'kita-artykul', title: 'Francuska polityka migracyjna' },
            { slug: 'bochenek-artykul', title: 'Europejskie realia prawno-karne' },
            { slug: 'horoszko-artykul', title: 'SzkoBa marzeD pokolenia Z' },
            { slug: 'trochanowska-artykul', title: 'Beata Trochanowska  Seksualizacja dzieci' },
            { slug: 'feszler-tsue', title: 'Sprawa C819/21' },
        ];

        for (const update of titleUpdates) {
            await queryRunner.query(`
                UPDATE \`Analysis\`
                SET \`title\` = ?
                WHERE \`slug\` = ?
            `, [update.title, update.slug]);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // This migration fixes data consistency, so down() is intentionally empty
        // to avoid breaking existing data relationships
    }

}