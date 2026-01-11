/* eslint-disable @typescript-eslint/no-unused-vars */
import { MigrationInterface, QueryRunner } from "typeorm";

export class FixAuthorsData1768119369984 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Fix existing author data by populating missing name, img, and bio fields
        // based on slug values and providing reasonable defaults

        // 1. Update names and displayNames based on existing slugs (convert slug format to proper names)
        await queryRunner.query(`
            UPDATE \`Author\`
            SET \`name\` = CASE
                WHEN \`slug\` = 'lempicka-wyszynska' THEN 'Dominika Łempicka-Wyszyńska'
                WHEN \`slug\` = 'balcerowski' THEN 'Dr Piotr Balcerowski'
                WHEN \`slug\` = 'kochman' THEN 'Adw. Oskar Kochman'
                WHEN \`slug\` = 'rosolowski' THEN 'Marcin Rosołowski'
                WHEN \`slug\` = 'luczuk' THEN 'Dr Piotr Łuczuk'
                WHEN \`slug\` = 'domanska' THEN 'Dr Aldona Domańska'
                WHEN \`slug\` = 'lewandowski' THEN 'Adw. dr Bartosz Lewandowski'
                WHEN \`slug\` = 'kochan' THEN 'Prof. Marek Kochan'
                WHEN \`slug\` = 'wos' THEN 'Rafał Woś'
                WHEN \`slug\` = 'gursztyn' THEN 'Piotr Gursztyn'
                WHEN \`slug\` = 'kita' THEN 'Kacper Kita'
                WHEN \`slug\` = 'swietlik' THEN 'Wiktor Świetlik'
                WHEN \`slug\` = 'rutke' THEN 'Grzegorz Rutke'
                WHEN \`slug\` = 'bochenek' THEN 'Adrian Bochenek'
                WHEN \`slug\` = 'trochanowska' THEN 'Beata Trochanowska'
                WHEN \`slug\` = 'bruszewski' THEN 'Michał Bruszewski'
                WHEN \`slug\` = 'giera' THEN 'Kamil Giera'
                WHEN \`slug\` = 'pietr' THEN 'Wojciech Pietr'
                WHEN \`slug\` = 'rak' THEN 'Dr Krzysztof Rak'
                WHEN \`slug\` = 'dakowski' THEN 'Marek Dakowski'
                WHEN \`slug\` = 'feszler' THEN 'Mateusz Feszler'
                WHEN \`slug\` = 'horoszko' THEN 'Aleksandra Horoszko'
                WHEN \`slug\` = 'trabinski' THEN 'Piotr Trąbiński'
                WHEN \`slug\` = 'okolowski' THEN 'Dr hab. Paweł Okolowski'
                WHEN \`slug\` = 'ratynski' THEN 'Dr Mateusz Ratynski'
                WHEN \`slug\` = 'rowinski' THEN 'Tomasz Rowiński'
                WHEN \`slug\` = 'siemiatkowski' THEN 'dr Jakub Siemiątkowski'
                WHEN \`slug\` = 'musial' THEN 'dr Adrian Musiał'
                WHEN \`slug\` = 'gorka' THEN 'adw. Grzegorz Górka'
                WHEN \`slug\` = 'szymanski' THEN 'Michał Szymański'
                WHEN \`slug\` = 'masior' THEN 'dr Michał Masior'
                WHEN \`slug\` = 'pietrzak' THEN 'Przemysław Pietrzak LL.M.'
                ELSE \`name\`
            END,
            \`displayName\` = CASE
                WHEN \`slug\` = 'lempicka-wyszynska' THEN 'Dominika Łempicka-Wyszyńska'
                WHEN \`slug\` = 'balcerowski' THEN 'Dr Piotr Balcerowski'
                WHEN \`slug\` = 'kochman' THEN 'Adw. Oskar Kochman'
                WHEN \`slug\` = 'rosolowski' THEN 'Marcin Rosołowski'
                WHEN \`slug\` = 'luczuk' THEN 'Dr Piotr Łuczuk'
                WHEN \`slug\` = 'domanska' THEN 'Dr Aldona Domańska'
                WHEN \`slug\` = 'lewandowski' THEN 'Adw. dr Bartosz Lewandowski'
                WHEN \`slug\` = 'kochan' THEN 'Prof. Marek Kochan'
                WHEN \`slug\` = 'wos' THEN 'Rafał Woś'
                WHEN \`slug\` = 'gursztyn' THEN 'Piotr Gursztyn'
                WHEN \`slug\` = 'kita' THEN 'Kacper Kita'
                WHEN \`slug\` = 'swietlik' THEN 'Wiktor Świetlik'
                WHEN \`slug\` = 'rutke' THEN 'Grzegorz Rutke'
                WHEN \`slug\` = 'bochenek' THEN 'Adrian Bochenek'
                WHEN \`slug\` = 'trochanowska' THEN 'Beata Trochanowska'
                WHEN \`slug\` = 'bruszewski' THEN 'Michał Bruszewski'
                WHEN \`slug\` = 'giera' THEN 'Kamil Giera'
                WHEN \`slug\` = 'pietr' THEN 'Wojciech Pietr'
                WHEN \`slug\` = 'rak' THEN 'Dr Krzysztof Rak'
                WHEN \`slug\` = 'dakowski' THEN 'Marek Dakowski'
                WHEN \`slug\` = 'feszler' THEN 'Mateusz Feszler'
                WHEN \`slug\` = 'horoszko' THEN 'Aleksandra Horoszko'
                WHEN \`slug\` = 'trabinski' THEN 'Piotr Trąbiński'
                WHEN \`slug\` = 'okolowski' THEN 'Dr hab. Paweł Okolowski'
                WHEN \`slug\` = 'ratynski' THEN 'Dr Mateusz Ratynski'
                WHEN \`slug\` = 'rowinski' THEN 'Tomasz Rowiński'
                WHEN \`slug\` = 'siemiatkowski' THEN 'dr Jakub Siemiątkowski'
                WHEN \`slug\` = 'musial' THEN 'dr Adrian Musiał'
                WHEN \`slug\` = 'gorka' THEN 'adw. Grzegorz Górka'
                WHEN \`slug\` = 'szymanski' THEN 'Michał Szymański'
                WHEN \`slug\` = 'masior' THEN 'dr Michał Masior'
                WHEN \`slug\` = 'pietrzak' THEN 'Przemysław Pietrzak LL.M.'
                ELSE \`displayName\`
            END
            WHERE \`name\` IS NULL OR \`name\` = '' OR \`displayName\` IS NULL OR \`displayName\` = ''
        `);

        // 2. Update image paths (set default images based on slug)
        await queryRunner.query(`
            UPDATE \`Author\`
            SET \`img\` = CONCAT('/images/authors/', \`slug\`, '.jpg')
            WHERE \`img\` IS NULL
        `);

        // 3. Update bio fields with meaningful descriptions where available
        await queryRunner.query(`
            UPDATE \`Author\`
            SET \`bio\` = CASE
                WHEN \`slug\` = 'balcerowski' THEN 'Zawodowo związany z trzecim sektorem. Jego zainteresowania badawcze obejmują przede wszystkim bezpieczeństwo publiczne i ekonomiczne. Absolwent Instytutu Nauk Politycznych Uniwersytetu Warszawskiego oraz Kolegium Gospodarki Światowej SGH.'
                WHEN \`slug\` = 'kochman' THEN 'Absolwent Wydziału Prawa i Administracji Uniwersytetu Warszawskiego. Adwokat - członek Izby Adwokackiej w Warszawie. Autor analiz i publikacji prawnych i ekonomicznych.'
                WHEN \`slug\` = 'rosolowski' THEN 'Absolwent Wydziału Prawa i Administracji Uniwersytetu Warszawskiego; w latach 2006-2008 zastępca dyrektora Biura Prasowego Kancelarii Prezydenta RP.'
                WHEN \`slug\` = 'luczuk' THEN 'Medioznawca; publicysta; ekspert ds. cyberbezpieczeństwa. Adiunkt w Katedrze Internetu i Komunikacji Cyfrowej Instytutu Edukacji Medialnej i Dziennikarstwa UKSW.'
                WHEN \`slug\` = 'domanska' THEN 'Prezes Instytutu Staszica; adiunkt Instytutu Studiów Międzynarodowych Szkoły Głównej Handlowej w Warszawie; doktor habilitowany nauk ekonomicznych.'
                WHEN \`slug\` = 'lewandowski' THEN 'Adwokat; doktor nauk prawnych; Dyrektor Centrum Interwencji Procesowej Ordo Iuris.'
                WHEN \`slug\` = 'kochan' THEN 'Językoznawca; medioznawca. Naukowo zajmuje się językiem komunikacji publicznej; wizerunkiem osób i instytucji.'
                WHEN \`slug\` = 'wos' THEN 'Dziennikarz i analityk ekonomiczny publikujący m.in. w Salonie24 i Dzienniku Gazeta Prawna.'
                WHEN \`slug\` = 'gursztyn' THEN 'Dziennikarz; publicysta; historyk. Pracował m.in. w Radiu Plus; Telewizji Puls; telewizji Polsat.'
                WHEN \`slug\` = 'kita' THEN 'Katolik; mężczyzna; analityk; publicysta. Obserwator polityki międzynarodowej i kultury.'
                ELSE 'Ekspert CASN specjalizujący się w analizach politycznych, gospodarczych i społecznych.'
            END
            WHERE \`bio\` IS NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Note: This migration fixes existing data, so down() would need to be careful
        // For safety, we don't revert the data fixes - they improve data quality
    }

}