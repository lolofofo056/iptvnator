import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';
import {
    listMarketingArtworkFixtures,
    type MarketingArtworkFixture,
} from '../../apps/xtream-mock-server/src/app/generators/marketing.generator.js';

type ArtworkKind = 'backdrop' | 'poster';
type ArtworkQuality = 'low' | 'medium' | 'high' | 'auto';
type RunMode = 'dry-run' | 'generate' | 'manifest' | 'validate';

type ArtworkJob = {
    contentType: 'movie' | 'series';
    filename: string;
    kind: ArtworkKind;
    outputPath: string;
    prompt: string;
    quality: ArtworkQuality;
    size: string;
    slug: string;
    title: string;
};

type ArtworkManifest = {
    assetRoot: string;
    assets: Array<{
        contentType: 'movie' | 'series';
        filename: string;
        kind: ArtworkKind;
        manualApprovalStatus: 'pending-human-review';
        model: string;
        prompt: string;
        quality: ArtworkQuality;
        size: string;
        slug: string;
        title: string;
    }>;
    model: string;
    outputFormat: 'png';
    version: 1;
};

const workspaceRoot = process.cwd();
const assetRoot = path.join(
    workspaceRoot,
    'apps/xtream-mock-server/public/marketing'
);
const manifestPath = path.join(assetRoot, 'manifest.json');
const relativeAssetRoot = 'apps/xtream-mock-server/public/marketing';
const defaultModel = 'gpt-image-2';
const outputFormat = 'png';

const args = process.argv.slice(2);
const mode = getMode(args);
const model = getStringArg('--model') ?? process.env['OPENAI_IMAGE_MODEL'] ?? defaultModel;
const quality = getQualityArg('--quality') ?? getQuality(process.env['OPENAI_IMAGE_QUALITY']) ?? 'medium';
const force = args.includes('--force');
const limit = getNumberArg('--limit');
const delayMs = getNumberArg('--delay-ms') ?? 0;

const allJobs = buildArtworkJobs(model, quality);
const jobs = allJobs.slice(0, limit ?? undefined);

async function main(): Promise<void> {
    if (mode === 'dry-run') {
        printDryRun();
        return;
    }

    ensureOutputDirs();
    writeManifest(model, allJobs);

    if (mode === 'manifest') {
        console.log(`Wrote artwork manifest: ${relativePath(manifestPath)}`);
        return;
    }

    if (mode === 'generate') {
        await generateMissingArtwork();
    }

    await validateArtwork(jobs);
}

function buildArtworkJobs(
    selectedModel: string,
    selectedQuality: ArtworkQuality
): ArtworkJob[] {
    return listMarketingArtworkFixtures().flatMap((fixture) =>
        (['poster', 'backdrop'] as const).map((kind) => {
            const filename = `${kind}/${fixture.slug}.png`;
            return {
                contentType: fixture.contentType,
                filename,
                kind,
                outputPath: path.join(assetRoot, filename),
                prompt: buildPrompt(fixture, kind),
                quality: selectedQuality,
                size: kind === 'poster' ? '1024x1536' : '1536x864',
                slug: fixture.slug,
                title: fixture.name,
            };
        })
    );
}

function buildPrompt(fixture: MarketingArtworkFixture, kind: ArtworkKind): string {
    const profile = promptProfileForTitle(fixture.name);
    const direction = visualDirectionForTitle(fixture.name);
    const shared = [
        `Create original fictional demo artwork for IPTVnator release screenshots.`,
        `Fictional ${fixture.contentType}: "${fixture.name}" (${fixture.year}).`,
        `Genre: ${fixture.genre}.`,
        `Story seed: ${fixture.tagline} ${fixture.description}`,
        `Visual direction: ${direction}`,
        `Visual medium and style: ${profile.style}`,
        `Palette and texture: ${profile.palette}`,
        [
            'Safety and originality constraints:',
            'Do not depict or reference any real movie, series, franchise, celebrity, actor likeness, branded character, copyrighted logo, trademarked costume, existing poster composition, or readable brand mark.',
            'No watermarks, no studio logos, no credits, no title typography, and no legible text.',
        ].join(' '),
    ];

    if (kind === 'poster') {
        return [
            'Use case: ads-marketing',
            'Asset type: portrait cover/poster PNG for a fictional streaming demo catalog.',
            ...shared,
            `Composition: portrait 2:3 ${profile.posterComposition}; high contrast at thumbnail size; title-safe image with no necessary text because the app UI renders metadata separately.`,
        ].join('\n');
    }

    return [
        'Use case: ads-marketing',
        'Asset type: landscape backdrop PNG for a fictional streaming demo details screen.',
        ...shared,
        `Composition: wide 16:9 ${profile.backdropComposition}; darker edges and open negative space so app UI overlays remain readable; no text or logos.`,
    ].join('\n');
}

type PromptProfile = {
    backdropComposition: string;
    palette: string;
    posterComposition: string;
    style: string;
};

function promptProfileForTitle(title: string): PromptProfile {
    const profiles: Record<string, PromptProfile> = {
        'Crimson Skylark': {
            style: 'golden-hour aerial adventure photography with realistic rescue-drama production design, wind, clouds, practical flight gear, and natural lens flare',
            palette:
                'sunrise coral, storm gray, aviation green, grainy but realistic atmospheric haze',
            posterComposition:
                'single rescue courier against a huge storm sky, diagonal flight path, naturalistic poster photography',
            backdropComposition:
                'vast sky route above a modern city, layered storm clouds, small courier silhouette, breathable horizon',
        },
        'The Voltage Guard': {
            style: 'gritty disaster-thriller photography, rain-soaked infrastructure, documentary realism, sparks, emergency work lights, no fantasy costumes',
            palette:
                'steel blue, sodium orange, wet asphalt black, white electrical flares',
            posterComposition:
                'workers and rail geometry forming a tense action triangle, practical uniforms and tools',
            backdropComposition:
                'wide elevated transit grid under unstable weather, workers small in frame, strong industrial depth',
        },
        'Midnight Mantle': {
            style: 'gothic noir illustration with theatrical shadow shapes, old print texture, rain, velvet blacks, and painterly mystery atmosphere',
            palette:
                'deep violet, amber marquee light, wet black streets, muted crimson accents',
            posterComposition:
                'theatre silhouette and sweeping cloak as an abstract mystery shape, not a superhero pose',
            backdropComposition:
                'empty theatre district at night, marquee glow without readable letters, cloak-like shadow crossing rooftops',
        },
        'Quantum Comet': {
            style: 'hard science-fiction concept art with crisp spacecraft detail, star charts, comet ice, scale diagrams, and luminous navigation UI shapes without readable text',
            palette:
                'icy cyan, white comet dust, deep navy, precise magenta navigation glows',
            posterComposition:
                'cartographer figure and fractured comet arc arranged like a scientific expedition poster',
            backdropComposition:
                'wide comet trail and distant armada silhouettes, clean negative space around the center',
        },
        'Orbit of Atlas': {
            style: 'epic cosmic survival painting with mineral surfaces, colony lights, gravitational dust ribbons, and solemn scale',
            palette:
                'burnt gold, moon gray, dusty umber, cold blue space shadows',
            posterComposition:
                'small rescue pilot dwarfed by a cracked moon, monumental survival mood',
            backdropComposition:
                'fractured moon over a remote colony, dust and sunlight bending in wide arcs',
        },
        'Nova Relay': {
            style: 'sleek space-opera animation art with clean silhouettes, radiant motion trails, glossy star-bridge architecture, and optimistic color',
            palette:
                'electric teal, royal blue, white light trails, warm planetary glow',
            posterComposition:
                'twin runners crossing a luminous bridge with strong graphic diagonals',
            backdropComposition:
                'star bridge leading toward a blue planet, two tiny figures and sweeping light messages',
        },
        'Beacon Boy and the Clockwork Garden': {
            style: 'storybook 3D animated fantasy, handmade brass mechanisms, moss, warm lantern light, rounded forms, and tactile toy-like detail',
            palette:
                'moss green, brass gold, warm amber, soft twilight blue',
            posterComposition:
                'young inventor, grandmother, and clockwork garden guardian in a warm discovery tableau',
            backdropComposition:
                'hidden underground garden with gears, vines, lanterns, and gentle mechanical guardians',
        },
        'The Invisible Saturday': {
            style: 'bright claymation-inspired family comedy, miniature fairground sets, visible handmade textures, playful invisible-person gags',
            palette:
                'cotton-candy pink, sunny yellow, grass green, soft sky blue',
            posterComposition:
                'floating ribbons, footprints, and balloons implying invisible siblings at a fair',
            backdropComposition:
                'wide neighborhood fair scene with playful impossible traces and generous open sky',
        },
        'Captain Kindling': {
            style: 'warm hand-painted camping comedy illustration, cozy forest dusk, ember glow, imperfect brush texture, gentle humor',
            palette:
                'campfire orange, pine green, twilight purple, warm tan canvas',
            posterComposition:
                'camp counselor spark and misfit camper silhouettes around a glowing clearing',
            backdropComposition:
                'wide forest camp at dusk with cabin lights, ember trails, and friendly wilderness depth',
        },
        'Masks of Tomorrow': {
            style: 'fashion-documentary editorial photography, fabric tables, workshop tools, mirrors, fittings, and soft daylight realism',
            palette:
                'cream fabric, graphite tools, tomato red thread, daylight blue shadows',
            posterComposition:
                'hands, mannequins, and unfinished masks arranged as an editorial magazine cover image',
            backdropComposition:
                'busy workshop with textiles and signal equipment, human craft details, no logo marks',
        },
        'Signal Tower Seven': {
            style: 'retro 1970s disaster-drama poster art, analog radio equipment, snowy mountain rescue maps, screen-print texture',
            palette:
                'faded mustard, radio-room brown, emergency red, winter blue',
            posterComposition:
                'radio operator profile, signal tower, and storm map shapes in vintage rescue-drama layout',
            backdropComposition:
                'wide analog signal room overlooking winter mountains and storm lights',
        },
        'The League of Lanterns': {
            style: 'human-interest documentary photography with natural faces, handheld lanterns, dark streets, and hopeful realism',
            palette:
                'blackout navy, lantern gold, brick red, soft skin tones',
            posterComposition:
                'volunteers carrying lanterns through darkness, intimate eye-level composition',
            backdropComposition:
                'wide city block during blackout with lantern paths and community silhouettes',
        },
        'Paper Moon Parade': {
            style: 'simple flat paper-cut illustration for children, large clean shapes, visible paper grain, gentle handmade collage, no realistic rendering',
            palette:
                'midnight blue, butter yellow, pale lavender, soft coral, warm paper white',
            posterComposition:
                'big smiling paper moon, tiny town silhouettes, parade shapes, lots of clean negative space',
            backdropComposition:
                'wide paper-cut town street under a rolling moon with simple parade banners and sparse stars',
        },
        'Dot and the Cloud Train': {
            style: 'ultra-simple preschool cartoon, rounded vector shapes, soft gradients, thick friendly outlines, very low detail',
            palette:
                'sky blue, marshmallow white, lemon yellow, strawberry pink, mint green',
            posterComposition:
                'small dot character stepping onto a rounded cloud train, clear simple shapes for young kids',
            backdropComposition:
                'wide pastel sky with a cloud train crossing simple weather-color stops',
        },
        'Tiny Planet Picnic': {
            style: 'minimal flat family sci-fi cartoon, clean vector-like shapes, playful scale, sparse details, soft geometric planets',
            palette:
                'peach, teal, lilac, sunny yellow, deep space blue used sparingly',
            posterComposition:
                'three children on a tiny round planet with picnic blanket and orbiting flowers',
            backdropComposition:
                'wide tiny planet landscape with flowers orbiting like satellites and open simple sky',
        },
        'The Quiet Aquarium': {
            style: 'abstract meditative poster art, flat translucent shapes, slow gradients, simplified fish silhouettes, calm museum-like composition',
            palette:
                'deep sea blue, glass cyan, muted violet, soft black, small coral accents',
            posterComposition:
                'large abstract aquarium window with drifting shapes and one quiet visitor silhouette',
            backdropComposition:
                'wide closed aquarium interior with glowing tanks, drifting abstract fish shapes, and quiet negative space',
        },
        'Square City Sonata': {
            style: 'Bauhaus-inspired abstract musical city art, flat geometric blocks, no perspective realism, rhythmic rectangles and circles',
            palette:
                'cream, brick red, cobalt blue, mustard yellow, charcoal',
            posterComposition:
                'stacked city blocks, windows, and circles arranged like a musical score',
            backdropComposition:
                'wide geometric city grid with crosswalk rhythms and streetlight circles across a flat afternoon',
        },
        'Lanterns Under Snow': {
            style: 'minimal winter folk illustration, flat shapes, quiet negative space, soft paper texture, restrained detail',
            palette:
                'snow white, ink navy, lantern amber, muted pine green, pale gray',
            posterComposition:
                'single warm lantern path climbing a snowy hill town with small simple figures',
            backdropComposition:
                'wide snowy hillside town with sparse houses, paper lantern dots, and a calm empty sky',
        },
        'Skyline Sentinels': {
            style: 'urban infrastructure drama photography, maintenance crew realism, rooftops, rails, bridge cables, sunrise work shift mood',
            palette:
                'concrete gray, safety yellow, sunrise peach, river blue',
            posterComposition:
                'young maintenance crew on a roof with tools and city geometry, not heroic costumes',
            backdropComposition:
                'wide rooftop and bridge panorama with work lights and morning haze',
        },
        'The Aegis Club': {
            style: 'warm workplace dramedy photography, neighborhood social club interiors, old wood, mismatched chairs, trophies, candid ensemble energy',
            palette:
                'walnut brown, faded green upholstery, brass lamps, soft cream walls',
            posterComposition:
                'group around an old club table with lived-in props and gentle humor',
            backdropComposition:
                'wide social club room with training area, memorabilia, and warm lamps',
        },
        'Starfall Academy': {
            style: 'colorful anime-inspired space-school illustration with expressive cadets, school-ship corridors, science experiments, and star windows',
            palette:
                'bubblegum pink, starship white, asteroid gray, neon mint',
            posterComposition:
                'cadets and floating school equipment in dynamic anime school-club composition',
            backdropComposition:
                'wide school-ship classroom near asteroid belt with desks, windows, and drifting experiment lights',
        },
        'Tomorrow Bureau': {
            style: 'minimalist bureaucratic sci-fi thriller, glass offices, files, clocks, reflection grids, restrained corporate unease',
            palette:
                'frosted glass, desaturated teal, paper white, warning red pinpoints',
            posterComposition:
                'analyst silhouette amid files and clocks, clean tense graphic composition',
            backdropComposition:
                'wide operations room with glass walls, layered clock reflections, and negative space',
        },
        'Alley Mask': {
            style: 'neo-noir street photography, bicycle courier realism, coded light marks, wet alleys, handheld camera energy',
            palette:
                'wet asphalt, sodium yellow, deep green shadows, chalk-white signal marks',
            posterComposition:
                'bike courier and alley geometry, face partly obscured by ordinary rain gear, grounded mystery',
            backdropComposition:
                'wide narrow alley after rain with coded signal glyphs and long perspective',
        },
        'Neon Sparrow': {
            style: 'stylized cyberpunk graphic novel art, rooftop rain, neon clue trails, birdlike light motifs, bold ink shapes',
            palette:
                'magenta neon, cyan rain, black ink, pale green glow',
            posterComposition:
                'rooftop messenger and sparrow-like light trail in bold graphic silhouette',
            backdropComposition:
                'wide rain-soaked rooftop cityscape with glowing clues and open sky',
        },
        'Cape Makers': {
            style: 'behind-the-scenes craft docuseries photography, sewing machines, engineering benches, stage fabric, candid hands-at-work details',
            palette:
                'indigo cloth, warm workshop bulbs, steel tools, chalk marks',
            posterComposition:
                'tailors and engineers at work around stage gear, tactile documentary composition',
            backdropComposition:
                'wide busy design studio with fabric rolls, benches, sketches without readable text',
        },
        'Citizens of the Beacon': {
            style: 'quiet social documentary photography, ordinary residents, practical signal lamps, neighborhood streets, compassionate realism',
            palette:
                'lamp amber, dusk blue, concrete gray, muted household colors',
            posterComposition:
                'ordinary residents around a beacon lamp, intimate human-interest portrait',
            backdropComposition:
                'wide neighborhood rescue network at dusk with lamps in windows and street corners',
        },
        'Bubble Street Workshop': {
            style: 'flat kids craft cartoon, simple circles and paper shapes, playful handmade textures, bright but not busy',
            palette:
                'bubblegum pink, craft paper tan, sky blue, crayon green, sunflower yellow',
            posterComposition:
                'round neighbors building a simple invention from paper, string, and circles',
            backdropComposition:
                'wide cheerful street workshop with tables, bubbles, paper circles, and open simple storefront shapes',
        },
        'Flatland Detectives': {
            style: 'flat geometric mystery comedy, shape-language characters, simple shadows, crisp poster design, no realism',
            palette:
                'warm gray, detective orange, navy, cream, clue green',
            posterComposition:
                'two geometric detectives inspecting a simple shape clue with playful noir lighting',
            backdropComposition:
                'wide flat neighborhood map scene with shadows, arrows, and geometric clues',
        },
        'Color Orchard': {
            style: 'preschool nature cartoon, very simple flat rounded shapes, soft friendly faces implied by objects, low detail',
            palette:
                'apple red, leaf green, pear yellow, sky blue, soft soil brown',
            posterComposition:
                'tiny caretakers under one large color-changing tree, simple fruit shapes and musical notes without text',
            backdropComposition:
                'wide gentle orchard made of rounded flat trees changing colors across the morning',
        },
        'Museum of Little Robots': {
            style: 'flat retro-future cartoon, simple rounded robots, clean museum shapes, limited details, soft mid-century geometry',
            palette:
                'dusty teal, warm cream, tomato red, brushed metal gray, muted orange',
            posterComposition:
                'small helpful robots arranging one oversized exhibit in a quiet museum hall',
            backdropComposition:
                'wide retro-future museum after closing with tiny robots, plinths, and simple geometric exhibits',
        },
    };

    return (
        profiles[title] ?? {
            backdropComposition:
                'immersive genre scene with clean depth and readable negative space',
            palette: 'balanced multi-color palette with tactile texture',
            posterComposition:
                'distinctive key image built around an original fictional subject',
            style: 'original genre artwork with a clearly differentiated visual language',
        }
    );
}

function visualDirectionForTitle(title: string): string {
    const directions: Record<string, string> = {
        'Crimson Skylark':
            'an aerial rescue courier navigating storm routes above Meridian City, a solar signal crest glowing in the cloudbreak',
        'The Voltage Guard':
            'transit workers protecting an elevated rail grid from a living thunderstorm, blue-white electricity reflected in wet streets',
        'Midnight Mantle':
            'an old theatre district at night, a mysterious cloak rumor visualized through shadows, marquee light, and rain-soaked cobblestones',
        'Quantum Comet':
            'an orbital cartographer crossing fractured comet trails beside a time-bent armada, star maps glowing in cold blue light',
        'Orbit of Atlas':
            'a rescue pilot navigating a cracked moon orbit over a fragile colony, gravity ribbons bending dust and sunlight',
        'Nova Relay':
            'twin signal runners racing across a luminous star bridge, urgent light messages streaking toward a blue planet',
        'Beacon Boy and the Clockwork Garden':
            'a young inventor and grandmother discovering mechanical garden guardians under a city park, brass leaves and gentle lantern light',
        'The Invisible Saturday':
            'two adventurous siblings at a neighborhood fair where only their footprints, floating ribbons, and playful shadows reveal them',
        'Captain Kindling':
            'a forest camp at dusk with ember-bright protective magic, young misfit campers gathered around a warm heroic spark',
        'Masks of Tomorrow':
            'costume makers, signal engineers, and citizens preparing original hero emblems in a workshop filled with fabric, tools, and soft window light',
        'Signal Tower Seven':
            'retro radio operators coordinating rescues from a tall signal room, analog dials, maps, and amber emergency light',
        'The League of Lanterns':
            'volunteers carrying lanterns through an impossible blackout, safe glowing paths forming across city streets',
        'Paper Moon Parade':
            'a flat paper-cut moon rolling through a tiny town with simple parade shapes and shy children joining in',
        'Dot and the Cloud Train':
            'a small dot boarding a soft cloud train that stops at simple weather-color stations',
        'Tiny Planet Picnic':
            'children preparing a picnic on a pocket-sized planet where flowers orbit like friendly satellites',
        'The Quiet Aquarium':
            'abstract glowing aquarium tanks after closing time, drifting shapes, quiet visitors, and calm water-light',
        'Square City Sonata':
            'geometric blocks, windows, crosswalks, and streetlights arranged as a flat city symphony',
        'Lanterns Under Snow':
            'neighbors carrying warm paper lanterns across a silent snowy hill town',
        'Skyline Sentinels':
            'a young rooftop rescue team watching rails, bridges, and river lights from high above Meridian City at sunrise',
        'The Aegis Club':
            'retired heroes in a restored neighborhood social club, worn memorabilia, warm lamps, and a new generation training nearby',
        'Starfall Academy':
            'cadets with unstable cosmic powers aboard a school ship near the asteroid belt, classroom windows filled with stars',
        'Tomorrow Bureau':
            'future analysts in a glass-walled operations room sorting one-day-ahead disaster files, clocks and reflections layered across the scene',
        'Alley Mask':
            'a bike courier stepping through deep city shadows while following strange signal glyphs in narrow alleys after rain',
        'Neon Sparrow':
            'a rooftop messenger following glowing clues that appear in midnight rain, neon reflections and small bright wing motifs',
        'Cape Makers':
            'tailors, engineers, and artists building original stage gear in a busy design studio, fabric tests and hand-built emblems everywhere',
        'Citizens of the Beacon':
            'ordinary residents maintaining a citywide rescue network after the first beacon, hopeful faces lit by practical signal lamps',
        'Bubble Street Workshop':
            'neighbors building simple inventions from circles, paper, string, and bright workshop tables',
        'Flatland Detectives':
            'two geometric detectives solving gentle neighborhood mysteries using maps, shadows, and shape clues',
        'Color Orchard':
            'a preschool orchard changing color each morning while tiny caretakers learn seasons and sound',
        'Museum of Little Robots':
            'small helpful robots arranging exhibits after closing time in a quiet retro-future museum',
    };

    return directions[title] ?? 'an original cinematic genre scene for a fictional streaming title';
}

async function generateMissingArtwork(): Promise<void> {
    const apiKey = process.env['OPENAI_API_KEY'];

    if (!apiKey) {
        throw new Error('OPENAI_API_KEY is required for --generate.');
    }

    for (const [index, job] of jobs.entries()) {
        if (existsSync(job.outputPath) && !force) {
            console.log(
                `[${index + 1}/${jobs.length}] exists, skipping ${job.filename}`
            );
            continue;
        }

        console.log(
            `[${index + 1}/${jobs.length}] generating ${job.filename} (${job.size}, ${job.quality})`
        );
        const imageBytes = await requestImage(apiKey, job);
        writeFileSync(job.outputPath, imageBytes);

        if (delayMs > 0 && index < jobs.length - 1) {
            await sleep(delayMs);
        }
    }
}

async function requestImage(apiKey: string, job: ArtworkJob): Promise<Buffer> {
    const payload = {
        model,
        prompt: job.prompt,
        quality: job.quality,
        size: job.size,
        output_format: outputFormat,
        moderation: 'auto',
    };

    for (let attempt = 1; attempt <= 4; attempt += 1) {
        const response = await fetch('https://api.openai.com/v1/images/generations', {
            body: JSON.stringify(payload),
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            method: 'POST',
        });

        const body = await response.json().catch(() => undefined);

        if (response.ok) {
            const imageBase64 = readImageBase64(body);
            return Buffer.from(imageBase64, 'base64');
        }

        const message = readErrorMessage(body) ?? `${response.status} ${response.statusText}`;
        if ((response.status === 429 || response.status >= 500) && attempt < 4) {
            const retryAfter = Number(response.headers.get('retry-after'));
            const waitMs = Number.isFinite(retryAfter)
                ? retryAfter * 1000
                : attempt * 15_000;
            console.warn(
                `OpenAI image request failed for ${job.filename}: ${message}. Retrying in ${Math.round(
                    waitMs / 1000
                )}s.`
            );
            await sleep(waitMs);
            continue;
        }

        throw new Error(
            `OpenAI image request failed for ${job.filename}: ${message}`
        );
    }

    throw new Error(`OpenAI image request failed for ${job.filename}.`);
}

function readImageBase64(body: unknown): string {
    if (
        typeof body === 'object' &&
        body !== null &&
        'data' in body &&
        Array.isArray((body as { data: unknown }).data)
    ) {
        const first = (body as { data: Array<{ b64_json?: unknown }> }).data[0];
        if (typeof first?.b64_json === 'string' && first.b64_json.length > 0) {
            return first.b64_json;
        }
    }

    throw new Error('OpenAI response did not include data[0].b64_json.');
}

function readErrorMessage(body: unknown): string | undefined {
    if (
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof (body as { error?: { message?: unknown } }).error?.message === 'string'
    ) {
        return (body as { error: { message: string } }).error.message;
    }

    return undefined;
}

async function validateArtwork(selectedJobs: ArtworkJob[]): Promise<void> {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ArtworkManifest;
    const expectedManifestCount = selectedJobs.length;

    if (manifest.version !== 1 || manifest.assets.length < expectedManifestCount) {
        throw new Error(
            `Manifest has ${manifest.assets.length} assets, expected at least ${expectedManifestCount}.`
        );
    }

    for (const job of selectedJobs) {
        if (!existsSync(job.outputPath)) {
            throw new Error(`Missing generated artwork: ${relativePath(job.outputPath)}`);
        }

        const metadata = await sharp(job.outputPath).metadata();
        const [expectedWidth, expectedHeight] = job.size.split('x').map(Number);

        if (metadata.format !== 'png') {
            throw new Error(`Artwork is not PNG: ${relativePath(job.outputPath)}`);
        }

        if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) {
            throw new Error(
                `Artwork has invalid dimensions: ${relativePath(job.outputPath)} ` +
                    `expected ${job.size}, got ${metadata.width}x${metadata.height}`
            );
        }
    }

    console.log(
        `Validated ${selectedJobs.length} artwork assets and manifest: ${relativePath(
            manifestPath
        )}`
    );
}

function writeManifest(selectedModel: string, selectedJobs: ArtworkJob[]): void {
    const manifest: ArtworkManifest = {
        assetRoot: relativeAssetRoot,
        assets: selectedJobs.map((job) => ({
            contentType: job.contentType,
            filename: job.filename,
            kind: job.kind,
            manualApprovalStatus: 'pending-human-review',
            model: selectedModel,
            prompt: job.prompt,
            quality: job.quality,
            size: job.size,
            slug: job.slug,
            title: job.title,
        })),
        model: selectedModel,
        outputFormat,
        version: 1,
    };

    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function printDryRun(): void {
    const manifest = {
        assetRoot: relativeAssetRoot,
        assets: jobs.map((job) => ({
            filename: job.filename,
            kind: job.kind,
            model,
            quality: job.quality,
            size: job.size,
            title: job.title,
        })),
        count: jobs.length,
        outputFormat,
    };

    console.log(JSON.stringify(manifest, null, 2));
}

function ensureOutputDirs(): void {
    mkdirSync(path.join(assetRoot, 'poster'), { recursive: true });
    mkdirSync(path.join(assetRoot, 'backdrop'), { recursive: true });
}

function getMode(argv: string[]): RunMode {
    const selectedModes = [
        argv.includes('--dry-run') ? 'dry-run' : undefined,
        argv.includes('--generate') ? 'generate' : undefined,
        argv.includes('--manifest') ? 'manifest' : undefined,
        argv.includes('--validate') ? 'validate' : undefined,
    ].filter(Boolean) as RunMode[];

    if (selectedModes.length > 1) {
        throw new Error('Choose only one mode: --dry-run, --manifest, --generate, or --validate.');
    }

    return selectedModes[0] ?? 'dry-run';
}

function getStringArg(name: string): string | undefined {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
}

function getNumberArg(name: string): number | undefined {
    const raw = getStringArg(name);
    if (raw === undefined) {
        return undefined;
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${name} must be a non-negative number.`);
    }

    return value;
}

function getQualityArg(name: string): ArtworkQuality | undefined {
    return getQuality(getStringArg(name));
}

function getQuality(raw: string | undefined): ArtworkQuality | undefined {
    if (
        raw === 'low' ||
        raw === 'medium' ||
        raw === 'high' ||
        raw === 'auto'
    ) {
        return raw;
    }

    if (raw === undefined) {
        return undefined;
    }

    throw new Error('Quality must be one of: low, medium, high, auto.');
}

function relativePath(filePath: string): string {
    return path.relative(workspaceRoot, filePath);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
