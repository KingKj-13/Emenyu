/**
 * The butcher's chart — geometry and editorial copy for the primal cuts of beef.
 *
 * Ported verbatim (paths, copy, label placement) from the standalone prototype
 * in `Test cow/meat-chart.html`. Nothing here knows about a restaurant, a menu
 * or a cart: it is the anatomy layer only. The cut -> menu-item wiring lives in
 * `cutMenuMap.ts`, and everything visual lives in `CowChart` / `CowMeatSelector`.
 *
 * Chart space is 1200 x 720, 1:1 with the pixels of the baked carcass plate
 * (`public/butchery/cow.webp`), so every path below is measured against that
 * render's alpha channel rather than eyeballed. Do not rescale one without the
 * other.
 */

export type NamingScheme = 'za' | 'us';

export interface CutDish {
  name: string;
  blurb: string;
}

export interface CutDefinition {
  id: string;
  names: Record<NamingScheme, string>;
  /** Short form set inside the animal on the chart (must fit its own region). */
  tag: Record<NamingScheme, string>;
  /** Why the two naming conventions disagree, when they do. */
  usNote: string;
  description: string;
  texture: string;
  bestFor: string[];
  /** Filename (no extension) of the cut photograph, or '' when none exists. */
  art: string;
  dishes: CutDish[];
}

/** Outline of the carcass. Clips every other layer, and doubles as the
 *  fallback drawing if the plate image never loads. */
export const SILHOUETTE = `M 152 240
  C 156 226 168 206 186 190 C 206 172 232 140 250 112
  C 262 92 278 66 300 58 C 314 62 320 76 324 88
  C 336 94 352 96 380 96 C 420 96 460 90 500 82
  C 520 79 534 78 552 79 C 580 82 604 88 640 90
  C 690 90 740 87 790 84 C 830 81 870 72 910 62
  C 940 55 976 50 1002 50 C 1020 50 1032 52 1042 58
  C 1052 82 1058 124 1058 172 C 1058 222 1054 264 1048 302
  C 1044 342 1042 380 1042 420 C 1044 452 1046 470 1048 492
  C 1048 532 1046 572 1044 602 C 1043 612 1042 616 1041 620
  L 1006 620 C 1006 598 1008 558 1010 518
  C 1010 496 1006 476 1000 456 C 992 436 984 420 976 408
  C 958 428 934 442 906 448 C 880 452 860 446 852 424
  C 842 400 832 390 822 386 C 792 400 742 412 700 412
  C 660 412 620 406 596 398 C 570 390 550 402 547 432
  C 548 472 550 522 550 572 C 551 600 552 614 553 620
  L 518 620 C 518 598 516 570 514 530
  C 512 490 508 460 500 440 C 488 424 470 400 452 380
  C 430 356 410 336 396 322 C 374 314 348 302 326 284
  C 310 278 288 274 262 274 C 230 274 194 268 172 258
  C 160 252 154 246 152 240 Z`;

/** The plate's own alpha leaves a notch between belly and hind leg; this fills
 *  it so the flank/thick-flank boundary reads as one continuous animal. */
export const MEND = `M 836 346 C 878 372 920 388 962 398
  C 978 402 990 408 996 416 C 990 424 972 422 950 416
  C 906 404 866 386 842 364 C 836 356 834 350 836 346 Z`;

/**
 * The rules dividing the carcass. Each entry is [cuts it borders, path]. They
 * lean forward as they descend, the way the muscle seams actually run — that
 * is what makes a chart read as anatomy instead of a grid.
 */
export const SEAMS: [string, string][] = [
  ['neck', 'M 330 90 C 322 142 318 204 322 284'],
  ['neck chuck', 'M 446 90 C 432 152 414 226 398 306 C 394 320 392 330 392 338'],
  ['chuck brisket', 'M 392 338 C 434 348 490 360 546 366'],
  ['chuck rib', 'M 606 86 C 592 152 576 226 560 300 C 552 330 548 352 546 366'],
  ['rib thinflank', 'M 546 366 C 594 368 642 366 688 360'],
  ['rib sirloin', 'M 718 86 C 710 152 702 226 696 296 C 692 326 690 348 688 360'],
  ['sirloin thinflank', 'M 688 360 C 726 356 764 350 800 344'],
  ['sirloin rump', 'M 820 82 C 818 128 816 176 814 224'],
  ['sirloin thickflank', 'M 814 224 C 812 264 806 306 800 344'],
  ['thinflank thickflank', 'M 800 344 C 810 372 820 396 832 416'],
  ['rump thickflank', 'M 814 224 C 838 234 862 242 886 248'],
  ['rump topside', 'M 886 248 C 912 252 938 254 962 254'],
  ['rump silverside', 'M 946 58 C 950 118 956 188 962 254'],
  ['thickflank topside', 'M 886 248 C 882 296 878 344 876 394'],
  ['topside silverside', 'M 962 254 C 968 306 974 358 978 406 C 981 430 983 444 985 458'],
  ['brisket shin', 'M 498 446 C 518 450 538 454 558 458'],
  ['topside shin', 'M 984 454 C 1006 459 1028 463 1050 468'],
  // the fillet lies beneath the loin, so the chart draws it inset
  ['fillet', 'M 726 176 C 730 156 752 144 776 144 C 796 144 806 156 802 170 C 796 188 770 198 746 195 C 732 193 724 186 726 176 Z'],
];

/**
 * Hit targets and fills. [dom id, cut id, path]. Internal edges follow the
 * seams exactly; outer edges run proud of the animal and are trimmed by the
 * silhouette clip. Fillet is last so it wins hit-testing over the loin above it.
 */
export const REGIONS: [string, string, string][] = [
  ['cut-neck', 'neck', `M 330 90 C 322 142 318 204 322 284
    C 344 292 366 304 386 322 C 389 330 390 334 392 338
    C 392 330 394 320 398 306 C 414 226 432 152 446 90 L 446 40 L 330 40 Z`],
  ['cut-chuck', 'chuck', `M 446 90 L 446 40 L 606 40 L 606 86
    C 592 152 576 226 560 300 C 552 330 548 352 546 366
    C 490 360 434 348 392 338 C 392 330 394 320 398 306
    C 414 226 432 152 446 90 Z`],
  ['cut-brisket', 'brisket', `M 392 338 C 434 348 490 360 546 366
    L 550 452 C 530 449 514 447 498 446
    C 470 424 440 390 414 356 C 400 348 394 342 392 338 Z`],
  ['cut-shin', 'shin', `M 498 446 C 518 450 538 454 558 458
    L 568 540 L 568 690 L 486 690 L 486 540 Z`],
  ['cut-shin-hind', 'shin', `M 968 450 C 994 456 1020 462 1048 468
    L 1058 540 L 1058 690 L 958 690 L 958 540 Z`],
  ['cut-rib', 'rib', `M 606 86 L 606 40 L 718 40 L 718 86
    C 710 152 702 226 696 296 C 692 326 690 348 688 360
    C 642 366 594 368 546 366 C 548 352 552 330 560 300
    C 576 226 592 152 606 86 Z`],
  ['cut-thinflank', 'thinflank', `M 546 366 C 594 368 642 366 688 360
    C 726 356 764 350 800 344 C 810 372 820 396 832 416
    C 764 434 668 440 598 436 C 566 432 552 404 550 380 Z`],
  ['cut-sirloin', 'sirloin', `M 718 86 L 718 40 L 820 40 L 820 82
    C 818 128 816 176 814 224 C 812 264 806 306 800 344
    C 764 350 726 356 688 360 C 690 348 692 326 696 296
    C 702 226 710 152 718 86 Z`],
  ['cut-rump', 'rump', `M 820 82 L 820 40 L 946 40 L 946 58
    C 950 118 956 188 962 254 C 938 254 912 252 886 248
    C 862 242 838 234 814 224 C 816 176 818 128 820 82 Z`],
  ['cut-thickflank', 'thickflank', `M 814 224 C 812 264 806 306 800 344
    C 810 372 820 396 832 416 C 850 412 866 404 876 394
    C 878 344 882 296 886 248 C 862 242 838 234 814 224 Z`],
  ['cut-topside', 'topside', `M 886 248 C 882 296 878 344 876 394
    C 900 410 928 430 950 448 C 956 449 962 450 968 450
    C 984 452 986 454 985 458 C 983 444 981 430 978 406
    C 974 358 968 306 962 254 C 938 254 912 252 886 248 Z`],
  ['cut-silverside', 'silverside', `M 946 58 L 946 20 L 1100 20 L 1100 340
    C 1090 400 1078 448 1064 486 C 1036 476 1010 466 985 458
    C 983 444 981 430 978 406 C 974 358 968 306 962 254
    C 956 188 950 118 946 58 Z`],
  ['cut-fillet', 'fillet', `M 726 176 C 730 156 752 144 776 144
    C 796 144 806 156 802 170 C 796 188 770 198 746 195
    C 732 193 724 186 726 176 Z`],
];

export interface CutLabel {
  cut: string;
  x: number;
  y: number;
  rot: number;
  size: number;
}

/** Every word is placed to sit wholly inside its own region: narrow bands are
 *  rotated to run with the band, the two shanks run down their legs. */
export const LABELS: CutLabel[] = [
  { cut: 'neck', x: 362, y: 196, rot: -78, size: 22 },
  { cut: 'chuck', x: 492, y: 212, rot: 0, size: 31 },
  { cut: 'brisket', x: 496, y: 392, rot: -11, size: 20 },
  { cut: 'shin', x: 531, y: 548, rot: -90, size: 17 },
  { cut: 'shin', x: 1026, y: 544, rot: -90, size: 16 },
  { cut: 'rib', x: 630, y: 216, rot: 0, size: 34 },
  { cut: 'sirloin', x: 752, y: 268, rot: -84, size: 21 },
  { cut: 'fillet', x: 764, y: 170, rot: -4, size: 16 },
  { cut: 'rump', x: 882, y: 160, rot: 0, size: 26 },
  { cut: 'thinflank', x: 664, y: 398, rot: 0, size: 24 },
  { cut: 'thickflank', x: 840, y: 310, rot: -80, size: 14 },
  { cut: 'topside', x: 914, y: 336, rot: -72, size: 15 },
  { cut: 'silverside', x: 1002, y: 230, rot: -84, size: 20 },
];

/**
 * One canonical set of anatomical regions, relabelled by convention.
 * Boundaries never move when the naming toggles; only the words do.
 */
export const CUTS: CutDefinition[] = [
  {
    id: 'neck', names: { za: 'Neck', us: 'Neck' }, tag: { za: 'NECK', us: 'NECK' },
    usNote: 'US butchery usually folds the neck into the Chuck primal rather than selling it apart.',
    description: 'The neck never stops working, so it is dense, coarse-grained muscle laced through with connective tissue. Given long wet heat that collagen turns to gelatin. It makes the richest gravy on the animal and the best mince you can grind.',
    texture: 'Coarse grain, heavy sinew, very little marbling.',
    bestFor: ['Slow braise', 'Potjie', 'Stock', 'Mince'], art: 'neck',
    dishes: [
      { name: 'Beef potjie', blurb: 'Three hours over coals in a cast-iron pot, barely stirred.' },
      { name: 'Brown stock', blurb: 'Roasted, then simmered overnight — the collagen does the rest.' },
      { name: 'Ragù', blurb: 'Minced coarse and cooked down until it falls apart on its own.' },
    ],
  },
  {
    id: 'chuck', names: { za: 'Chuck', us: 'Chuck' }, tag: { za: 'CHUCK', us: 'CHUCK' }, usNote: '',
    description: 'The shoulder is a bundle of muscles pulling in different directions, which is why it is sold cubed or as a whole roast rather than cut into steaks. Generous marbling makes it the most forgiving braising cut in the carcass.',
    texture: 'Well marbled, mixed grain, moderate connective tissue.',
    bestFor: ['Braise', 'Pot roast', 'Mince', 'Slow smoke'], art: 'chuck',
    dishes: [
      { name: 'Chuck roast', blurb: 'Four hours at 140°C, covered, until a fork turns in it freely.' },
      { name: 'Burger blend', blurb: 'Around 20% fat straight off the cut — no trimming needed.' },
      { name: 'Beef curry', blurb: 'Cubed, browned hard, then left alone in the pot.' },
    ],
  },
  {
    id: 'brisket', names: { za: 'Brisket', us: 'Brisket' }, tag: { za: 'BRISKET', us: 'BRISKET' }, usNote: '',
    description: 'The chest muscle carries the standing weight of the animal: a thick fat cap over two muscles whose grains run in opposite directions. It needs hours, and it repays them more completely than anything else on the carcass.',
    texture: 'Dense, long grain, thick fat cap, tough until fully rendered.',
    bestFor: ['Smoke', 'Braise', 'Salt-cure', 'Boil'], art: '',
    dishes: [
      { name: 'Smoked brisket', blurb: 'Twelve hours at 110°C. Pull it when it probes like soft butter.' },
      { name: 'Salt beef', blurb: 'Brined a week, then simmered slow and sliced against the grain.' },
      { name: 'Pastrami', blurb: 'Cured, coated in cracked pepper and coriander, then smoked.' },
    ],
  },
  {
    id: 'shin', names: { za: 'Shin', us: 'Shank' }, tag: { za: 'SHIN', us: 'SHANK' }, usNote: '',
    description: 'Foreleg and hind leg below the knee and hock, wrapped tight around the bone. More collagen per gram than anywhere else on the animal, with marrow in the middle. Cooked properly it goes from the toughest cut to the silkiest.',
    texture: 'Very tough raw; gelatinous and unctuous once broken down.',
    bestFor: ['Braise', 'Osso buco', 'Stock', 'Soup'], art: 'shin',
    dishes: [
      { name: 'Osso buco', blurb: 'Cross-cut with the bone in, braised until the marrow loosens.' },
      { name: 'Shin potjie', blurb: 'The South African default — bone in, lid on, low coals.' },
      { name: 'Pho broth', blurb: 'Shin and marrow bone, charred aromatics, six hours at a bare tremble.' },
    ],
  },
  {
    id: 'rib', names: { za: 'Prime Rib', us: 'Rib' }, tag: { za: 'RIB', us: 'RIB' }, usNote: '',
    description: 'The rib section barely moves, so the muscle stays fine-grained and heavily marbled under a fat cap that bastes it from the outside in. This is where tenderness and flavour overlap most generously — most cuts trade one for the other.',
    texture: 'Fine grain, heavy marbling, soft fat cap.',
    bestFor: ['Roast', 'Grill', 'Braai', 'Reverse sear'], art: 'rib',
    dishes: [
      { name: 'Ribeye on the coals', blurb: 'Thick cut, hard sear, pulled at 52°C and rested.' },
      { name: 'Standing rib roast', blurb: 'Bones left on as a rack. Rested as long as it was cooked.' },
      { name: 'Tomahawk', blurb: 'The same steak with the rib bone left long, for the theatre of it.' },
    ],
  },
  {
    id: 'sirloin', names: { za: 'Sirloin', us: 'Strip Loin' }, tag: { za: 'SIRLOIN', us: 'STRIP LOIN' },
    usNote: 'Sold in the US as Strip Loin, New York Strip or Kansas City Strip. The American primal called “sirloin” is a different, further-back section — the word does not translate directly.',
    description: 'The strip of loin running along the spine behind the ribs. Firm bite, clean beef flavour, and a band of fat down one edge that should be left on through cooking. It carries more chew than fillet and considerably more taste.',
    texture: 'Firm, tight grain, moderate marbling, distinct fat edge.',
    bestFor: ['Braai', 'Grill', 'Pan-sear', 'Roast whole'], art: 'sirloin',
    dishes: [
      { name: 'Strip steak', blurb: 'Cast iron, smoking hot, basted with butter at the end.' },
      { name: 'Club steak', blurb: 'Cut on the bone with a sliver of fillet still attached.' },
      { name: 'Whole roast loin', blurb: 'Tied, seared, then finished slowly and carved at the table.' },
    ],
  },
  {
    id: 'fillet', names: { za: 'Fillet', us: 'Tenderloin' }, tag: { za: 'FILLET', us: 'TENDER' }, usNote: '',
    description: 'The tenderloin sits tucked up under the spine doing almost no work, which is precisely why it is the tenderest muscle on the animal. It is also the leanest and the mildest — you are buying texture, and you should cook it accordingly.',
    texture: 'Extremely tender, very lean, almost no marbling.',
    bestFor: ['Pan-sear', 'Fast grill', 'Roast whole', 'Raw'], art: 'fillet',
    dishes: [
      { name: 'Fillet steak', blurb: 'Cut thick so the outside browns before the middle passes rare.' },
      { name: 'Beef Wellington', blurb: 'Whole fillet, duxelles, pastry — the lack of fat is the point.' },
      { name: 'Carpaccio', blurb: 'Frozen briefly, sliced translucent, dressed with oil and lemon.' },
    ],
  },
  {
    id: 'rump', names: { za: 'Rump', us: 'Top Sirloin' }, tag: { za: 'RUMP', us: 'TOP SIRLOIN' },
    usNote: 'Sold in the US as Top Sirloin. Note that the American “rump roast” is an entirely different cut, taken from the round further down the hind leg.',
    description: 'The top of the hip, sitting directly behind the sirloin with a fat cap over it. Firmer and more assertively beefy than any of the loin cuts, and it holds its flavour at higher temperatures. In South Africa it is the default braai steak.',
    texture: 'Firm, slightly coarse grain, good fat cap, deep flavour.',
    bestFor: ['Braai', 'Grill', 'Pan-sear', 'Roast'], art: 'rump',
    dishes: [
      { name: 'Rump on the braai', blurb: 'Fat cap down first to render, then turned once.' },
      { name: 'Picanha', blurb: 'The fat-capped point, skewered in a C and cut against the grain.' },
      { name: 'Rump roast', blurb: 'Cooked to medium rare and carved thin — never past it.' },
    ],
  },
  {
    id: 'thinflank', names: { za: 'Thin Flank', us: 'Flank' }, tag: { za: 'FLANK', us: 'FLANK' },
    usNote: 'US butchery splits this region between Flank Steak and the Short Plate.',
    description: 'The lower belly behind the ribs: a thin, loose sheet of muscle with a pronounced grain running one way only. Marinate it, cook it fast over high heat, and slice it hard across the grain or it will fight you.',
    texture: 'Loose, very coarse grain, lean but full-flavoured.',
    bestFor: ['Fast grill', 'Marinate', 'Stir-fry', 'Braai'], art: 'thinflank',
    dishes: [
      { name: 'Flank steak', blurb: 'Marinated overnight, four minutes a side, rested, sliced thin.' },
      { name: 'Fajitas', blurb: 'Charred hard, sliced across the grain while still hot.' },
      { name: 'Stir-fry beef', blurb: 'Cut against the grain first, then seared in seconds.' },
    ],
  },
  {
    id: 'thickflank', names: { za: 'Thick Flank', us: 'Round' }, tag: { za: 'T. FLANK', us: 'ROUND' },
    usNote: 'Part of the Round; sold as the Knuckle or Sirloin Tip.',
    description: 'The knuckle, sitting in front of the femur. Lean, uniformly grained and easy to portion, which makes it the cut butchers cube for stew and slice thin for schnitzel. Value rather than luxury, and it behaves if you respect the lack of fat.',
    texture: 'Lean, even grain, little marbling, dries out past medium.',
    bestFor: ['Braise', 'Stew', 'Schnitzel', 'Slow roast'], art: 'thickflank',
    dishes: [
      { name: 'Beef schnitzel', blurb: 'Sliced across, beaten thin, crumbed and fried fast.' },
      { name: 'Stew', blurb: 'Cubed and browned, then two hours in stock with the lid on.' },
      { name: 'Sliced roast beef', blurb: 'Roasted rare, chilled, and shaved for sandwiches.' },
    ],
  },
  {
    id: 'topside', names: { za: 'Topside', us: 'Round' }, tag: { za: 'TOPSIDE', us: 'ROUND' },
    usNote: 'Part of the Round; sold as Top Round or Inside Round.',
    description: 'The inner face of the hind leg — one large, lean, single-grained muscle with no fat cover except one a butcher ties on. Roasted rare and carved thin it is excellent. Taken past medium it turns to leather, and there is no rescuing it.',
    texture: 'Very lean, fine even grain, no natural fat cover.',
    bestFor: ['Roast rare', 'Braise', 'Slice raw', 'Corn / cure'], art: 'topside',
    dishes: [
      { name: 'Roast topside', blurb: 'Larded or barded, cooked to 52°C, carved almost translucent.' },
      { name: 'Beef olives', blurb: 'Thin slices rolled around stuffing, then braised.' },
      { name: 'Steak tartare', blurb: 'Its fine grain and low fat make it the classic choice.' },
    ],
  },
  {
    id: 'silverside', names: { za: 'Silverside', us: 'Round' }, tag: { za: 'SILVERSIDE', us: 'ROUND' },
    usNote: 'Part of the Round; sold as Bottom Round or Outside Round.',
    description: 'The outer face of the hind leg, named for the sheet of silver connective tissue lying over it, which must come off before cooking. Lean and tight-grained, and traditionally cured rather than roasted — this is the cut that becomes biltong.',
    texture: 'Lean and tight, with a silverskin membrane to remove.',
    bestFor: ['Cure / biltong', 'Pot roast', 'Corned beef', 'Braise'], art: 'silverside',
    dishes: [
      { name: 'Biltong', blurb: 'Cut with the grain, spiced with coriander and vinegar, air-dried.' },
      { name: 'Corned beef', blurb: 'Brined, then simmered until a skewer slides clean.' },
      { name: 'Pot roast', blurb: 'Browned then braised submerged, because it has no fat of its own.' },
    ],
  },
];

export const CUT_BY_ID = new Map(CUTS.map(c => [c.id, c]));

export function cutName(cut: CutDefinition, scheme: NamingScheme): string {
  return cut.names[scheme];
}

export function cutAltName(cut: CutDefinition, scheme: NamingScheme): string {
  return scheme === 'za' ? `US · ${cut.names.us}` : `ZA · ${cut.names.za}`;
}

/** The three round cuts all read "Round" in US mode, so the accessible name
 *  carries the subprimal too — otherwise they are indistinguishable. */
export function cutAccessibleName(cut: CutDefinition, scheme: NamingScheme): string {
  return scheme === 'us' && cut.usNote ? `${cutName(cut, scheme)} — ${cut.usNote}` : cutName(cut, scheme);
}
