// Metabolomics primer — distilled from "An Introduction to Metabolomics"
// lecture series (The Metabolomics Innovation Centre / D. Wishart),
// youtube.com/watch?v=VSaybKFQnqM. Original prose; foundations first,
// implications last. The wording of the science follows the lectures; the
// implications chapter is this author's read for the Metabolon interview.

export interface PrimerTerm {
  term: string;
  def: string;
}

export interface PrimerCheck {
  q: string;
  a: string;
}

export interface PrimerSection {
  heading?: string;
  paragraphs: string[];
}

export interface PrimerLink {
  node: string;
  label: string;
}

export interface PrimerChapter {
  id: string;
  number: number;
  title: string;
  kicker: string;
  sections: PrimerSection[];
  terms: PrimerTerm[];
  checks: PrimerCheck[];
  reconLinks: PrimerLink[];
}

export interface PrimerTrack {
  id: string;
  tab: string;
  title: string;
  lede: string;
  credit: string;
  /** localStorage key for chapter completion — stable per track. */
  doneKey: string;
  chapters: PrimerChapter[];
}

export const PRIMER_TITLE = "Metabolomics, from zero";
export const PRIMER_LEDE =
  "A hand-holding walkthrough from foundations to the implications that matter " +
  "in a metabolomics platform interview. Distilled from the TMIC introductory " +
  "lecture series; each chapter ends with self-checks and jump links into the " +
  "architecture recon graph.";
export const PRIMER_CREDIT =
  "Source material: “An Introduction to Metabolomics” lecture series, The " +
  "Metabolomics Innovation Centre (Wishart lab) — YouTube playlist " +
  "PLE20foNk9J6IGPVSFkfn6U7lmUzFvWPYQ. Prose is original; errors are the distiller's.";

export const PRIMER_CHAPTERS: PrimerChapter[] = [
  {
    id: "pyramid",
    number: 1,
    title: "The pyramid of life",
    kicker: "WHERE THE METABOLOME SITS",
    sections: [
      {
        paragraphs: [
          "Stack the omics as a pyramid: the genome at the base, the proteome above it, the metabolome at the top. Genes code for proteins; proteins exist to facilitate and accelerate chemistry; and the chemistry itself happens among the metabolites. The higher you climb the pyramid, the stronger the influence of the environment — what you eat, drink, and breathe barely touches your genome, but it rewrites your metabolome within minutes.",
          "That position makes the metabolome the interface between the genome and the environment, which is why it is the most sensitive readout of phenotype we have. It also amplifies the genome: a single base change can produce a ten-thousand-fold change in a metabolite's concentration. Metabolites are called the canaries of the genome for exactly this reason, and clinicians have used them that way — newborn screening for inborn errors of metabolism — for the better part of a century.",
          "One more thing the genome view hides: every tissue carries essentially the same DNA, but the brain, liver, skin, and gut run very different chemistry. Organs bathe in their own fluids — kidneys produce urine, bone marrow produces blood cells, the brain sits in cerebrospinal fluid, salivary glands make saliva — so analyzing a biofluid gives you a detailed, organ-specific picture that genomics structurally cannot.",
        ],
      },
    ],
    terms: [
      { term: "Metabolome", def: "The complete set of small molecules in a cell, tissue, organism, or biofluid — the top of the omics pyramid." },
      { term: "Phenotype", def: "The observable state of an organism; the metabolome is its most sensitive molecular indicator." },
      { term: "Canary of the genome", def: "A metabolite whose concentration amplifies a genetic change — one base change can move a metabolite 10,000-fold." },
    ],
    checks: [
      { q: "Why is the metabolome a better phenotype readout than the genome?", a: "Because it sits at the interface with the environment: it changes with diet, exposure, and physiology in minutes, while the genome is static across tissues and time — and it amplifies genomic changes enormously." },
      { q: "Your genome is nearly identical in every organ. Why isn't your metabolome?", a: "Each organ runs different chemistry and bathes in its own biofluid — urine, blood, CSF, saliva — so metabolite profiles are organ-specific even though the DNA isn't." },
    ],
    reconLinks: [],
  },
  {
    id: "metabolome",
    number: 2,
    title: "What a metabolome actually is",
    kicker: "DEFINITIONS, SIZES, AND DARK MATTER",
    sections: [
      {
        paragraphs: [
          "By analogy with genomics — identify and characterize all the genes — metabolomics aims to identify and characterize all the small molecules in a cell, tissue, or organism. A metabolite is any organic (or even inorganic) molecule under roughly 1,500 daltons. The cutoff is arbitrary but useful: it takes in essentially all lipids, sugars, organic acids, nucleosides, small peptides of ten or twelve residues, and short oligonucleotides.",
          "Crucially, the metabolome is not just what your body synthesizes. It includes what you ate (foods carry perhaps 30,000 known chemicals plus additives), the drugs you took (about 1,500 approved drugs, tracked with their metabolites in DrugBank), environmental toxins and pollutants (about 3,600 tracked; if they're above nanomolar you're in trouble), and everything your microbiome produces. None of that is less of a metabolite for being exogenous.",
        ],
      },
      {
        heading: "SIZES — AND WHY THE NUMBER KEEPS GROWING",
        paragraphs: [
          "Mammals are, chemically, the simple case: roughly 60,000 known chemicals, with about 20,000 catalogued endogenous human metabolites in the Human Metabolome Database, spanning concentrations from picomolar up to urea's ~100 millimolar. Microbes are more diverse. Plants are the champions at ~300,000 known compounds — a plant cannot run away, so it wages chemical warfare, evolving thousands of secondary metabolites as its defense budget.",
          "Unlike the genome, the metabolome has no fixed size: it is defined by detection technology, and every sensitivity improvement makes it bigger. Beyond the catalogued compounds lies the dark matter: over 100,000 plausible lipids, ~10,000 expected drug metabolites, up to half a million secondary food metabolites, and the metabolites-of-metabolites produced by liver enzymes and microflora. Estimated together: one and a half to two million compounds that are in no database and have never been characterized.",
        ],
      },
    ],
    terms: [
      { term: "Metabolite", def: "Any small molecule under ~1,500 Da — endogenous, dietary, pharmaceutical, environmental, or microbial." },
      { term: "HMDB", def: "The Human Metabolome Database: ~20,000 catalogued endogenous human metabolites with reference data." },
      { term: "Dark matter", def: "The 1.5–2 million predicted-but-uncharacterized compounds — uncatalogued lipids, drug and food metabolites, metabolites of metabolites." },
      { term: "Secondary metabolite", def: "A compound evolved for defense or signaling rather than core metabolism; the reason plants have ~300,000 known chemicals." },
    ],
    checks: [
      { q: "Why do plants have a metabolome five times richer than mammals'?", a: "They can't run away. Chemical warfare is their only defense, so evolution equipped them with hundreds of thousands of secondary metabolites. Mobile organisms could stay chemically simple." },
      { q: "Why can't we state the size of the human metabolome the way we state the number of genes?", a: "The metabolome is bounded by instrument sensitivity, not biology. Every improvement in detection reveals more of the dark matter, so the catalogue keeps growing." },
    ],
    reconLinks: [],
  },
  {
    id: "small-molecules",
    number: 3,
    title: "Why small molecules run the show",
    kicker: "CLINICAL, PHARMACEUTICAL, AND TEMPORAL STAKES",
    sections: [
      {
        paragraphs: [
          "Small molecules are not a niche. Around 90% of routine clinical assays — the tests actually billed to health agencies — are small-molecule tests. Around 90% of drugs are small molecules, and roughly 55% of those derive from pre-existing natural compounds: most brilliant drug ideas are borrowed from nature. About a third of all genetic disorders are diseases of small-molecule metabolism. And within cells, metabolites are not just bricks and mortar but the cofactors and signaling molecules for thousands of pathways, most of them in no textbook.",
          "The metabolome is also the time-sensitive ome. Eat a meal and your metabolite levels visibly climb and fall within minutes; your proteome barely stirs; your genome does nothing at all. That temporal sensitivity is a superpower when you want to track dynamics over seconds to hours, and a trap when you don't design for it — which is why study design controls for diet, age, time of day, sex, and body mass index.",
          "One more asymmetry in metabolomics' favor: metabolism is understood. The core pathways were worked out in the 1950s and 60s — reactions, rates, cofactors — in more mechanistic detail than almost any other corner of biology. That detail is why the most sophisticated systems-biology models grew out of metabolic reconstructions, and why metabolomics is the natural glue between the omes.",
        ],
      },
    ],
    terms: [
      { term: "Targeted assay", def: "A quantitative test for a predefined panel of compounds — the shape of nearly every clinical metabolite test." },
      { term: "Temporal sensitivity", def: "The metabolome changes in minutes with meals, stress, or drugs — unlike the static genome. Advantage and confound at once." },
      { term: "Systems biology", def: "Modeling the genome, proteome, and metabolome together; its most successful models grew out of metabolic reconstruction." },
    ],
    checks: [
      { q: "A study compares patient and control metabolomes but ignores collection time and diet. What goes wrong?", a: "Meal timing and diet move metabolites on the same scale as disease. The study measures breakfast, not biology — several published studies fell exactly this way." },
      { q: "Why did systems biology grow out of metabolomics rather than genomics?", a: "Because metabolism is the best-understood layer of biology — reactions, rates, and cofactors known in detail since the 1950s-60s — giving models something mechanistic to be built from." },
    ],
    reconLinks: [],
  },
  {
    id: "workflow",
    number: 4,
    title: "The workflow, end to end",
    kicker: "FROM LIVING SAMPLE TO LIST OF NUMBERS",
    sections: [
      {
        paragraphs: [
          "Every metabolomics study walks the same spine: collect a sample (plant, animal, microbial), get it into a fluid (chemistry is easier in fluids — extract solids, collect biofluids directly), separate and detect (chromatography into mass spectrometry, or NMR), then compute. The analytical chemistry is decades old; the revolution is at the last step — identifying and quantifying the components of a complex mixture directly, without purifying anything first.",
          "Before any of that: quench. Samples are alive. Blood is a living tissue; even urine and saliva carry living cells that keep transforming metabolites on the bench. Flash-freezing in liquid nitrogen is best; sodium azide or EDTA kills bacterial activity; work fast and cold. A sample that sat un-quenched, or was freeze-thawed a hundred times, or was pooled across labs with different protocols, will show you noise and nothing else. The rule from the lectures: a few hours of thoughtful design saves a few years of fruitless data processing.",
        ],
      },
      {
        heading: "THE FOUR STEPS — AND THE COVERAGE REALITY",
        paragraphs: [
          "Computation then proceeds in four steps. One: spectra to lists — either compounds with concentrations, or at minimum features with intensities. Two: lists to significant metabolites, via multivariate statistics. Three: significant metabolites to pathways. Four: pathways to biomarkers and models. Most of the time is spent on step one; most of the fear lives in step two; most of the fun is in three and four.",
          "Set expectations against the other omics: a complete genome costs a couple thousand dollars; proteomics routinely measures 5,000–10,000 proteins; in metabolomics you are doing very well to identify and quantify 200 compounds. The reason is chemistry. Genomics handles four similar bases with one instrument; proteomics, twenty amino acids; metabolomics faces hundreds of thousands of chemicals across ~10,000 chemical species with wildly different behaviors — demanding an arsenal of instruments that fills rooms.",
        ],
      },
    ],
    terms: [
      { term: "Quenching", def: "Stopping metabolism at collection (flash-freeze, azide/EDTA) so the sample measured is the sample taken — cells keep metabolizing on the bench." },
      { term: "Feature", def: "A reproducible peak with a retention time or chemical shift and an intensity, before anyone knows which compound it is." },
      { term: "The four steps", def: "Spectra → lists → significant metabolites → pathways and biomarkers. Step one eats the time." },
    ],
    checks: [
      { q: "Why does metabolomics quantify ~200 compounds while proteomics reaches 10,000 proteins?", a: "Chemical diversity. Four bases or twenty amino acids behave predictably on one instrument; hundreds of thousands of chemically distinct metabolites don't — coverage is limited by chemistry, not effort." },
      { q: "A collaborator offers five-year-old freezer samples, never quenched, pooled from three labs. What do you tell them?", a: "That the metabolomes measured will be dominated by handling artifacts, not biology. Un-quenched, inconsistently collected samples produce noise — design has to come before collection." },
    ],
    reconLinks: [
      { node: "samples", label: "Sample intake in the recon" },
      { node: "prep", label: "Automated sample prep in the recon" },
    ],
  },
  {
    id: "separation",
    number: 5,
    title: "Separation science",
    kicker: "CHROMATOGRAPHY — LC, HILIC, AND THE FORGOTTEN COUSIN",
    sections: [
      {
        paragraphs: [
          "Chromatography separates a mixture by racing it through two phases: a mobile phase (liquid or gas) carrying the sample through a stationary phase that grabs different compounds with different strength — by charge, porosity, or hydrophobicity. Differential partitioning spreads the mixture out in time.",
          "The workhorse is high-performance liquid chromatography (HPLC), mature since the 1970s: high pressure pushing analytes through columns of tiny particles. Reversed phase — greasy stationary phase, polar mobile phase — is the default mode, but it quietly discards the point: most metabolites in the body are very polar and shoot straight through a reversed-phase column unretained. HILIC, with a polar stationary phase, is gaining ground precisely because it retains what reversed phase loses. Column physics: longer columns separate better but slower; shrinking particles from 5 microns to 1–2 lets short columns separate brilliantly and fast, at the cost of much higher pressure — that is all UPLC is.",
          "Gas chromatography is the forgotten cousin: older, and in some ways better — sharper peaks, higher plate counts, more reproducible than LC. The sample must fly as a gas through a 10-meter coated capillary, so non-volatile metabolites first get chemically decorated with trimethylsilyl groups to make them volatile. That derivatization is GC's tax: chemistry never runs at 100%, and one compound can emerge as several differently-derivatized species.",
        ],
      },
    ],
    terms: [
      { term: "Reversed phase", def: "Nonpolar stationary phase with polar mobile phase — the default LC mode, blind to the very polar majority of metabolites." },
      { term: "HILIC", def: "Hydrophilic-interaction chromatography: polar stationary phase that retains the polar metabolites reversed phase lets through." },
      { term: "UPLC", def: "HPLC with 1–2 micron particles at much higher pressure: better separation on shorter columns in less time." },
      { term: "TMS derivatization", def: "Chemically adding trimethylsilyl groups so non-volatile compounds can fly through a GC — powerful, but incomplete chemistry multiplies species." },
    ],
    checks: [
      { q: "Your reversed-phase LC-MS run shows a huge unretained blob at the void volume. What is it and what do you change?", a: "The polar metabolites — most of the metabolome — that a greasy column can't hold. Add a HILIC method to retain and resolve them." },
      { q: "Why does one sugar produce several GC peaks?", a: "Derivatization chemistry is incomplete: the same sugar leaves with one, two, or three TMS groups attached, and each variant flies differently." },
    ],
    reconLinks: [{ node: "prep", label: "Where prep meets separation in the recon" }],
  },
  {
    id: "mass-spec",
    number: 6,
    title: "Mass spectrometry",
    kicker: "WEIGHING MOLECULES — AND THEIR FRAGMENTS",
    sections: [
      {
        paragraphs: [
          "Mass spectrometry identifies molecules by weighing them. Measure a mass-to-charge ratio to within one part per million and the molecular formula falls out of the mass alone — C6H12O6 is not a guess at that precision. Configurations are named by what feeds the spectrometer: GC-MS, LC-MS, and MS/MS, where two analyzers in tandem weigh a molecule, shatter it, then weigh the fragments. Fragmentation is a fingerprint: aspirin breaks apart the same predictable way every time.",
          "Ionization comes hard or soft. Electron ionization slams 70-electron-volt electrons into molecules, shattering them for rich structural information; chemical ionization is gentler and keeps the parent ion visible. The soft methods that transformed biology — electrospray (spraying charged droplets from a nozzle under voltage) and MALDI (a laser blasting analyte out of a UV-absorbing matrix) — show you the intact parent ion and its adducts.",
          "Analyzers trade resolution for money: quadrupoles and ion traps resolve about a dalton cheaply; the triple quadrupole is the most popular mass spectrometer in the world, the machine behind drug assays and newborn screening; time-of-flight, Orbitraps, and FT-ICR instruments reach near-exact mass at near-exact prices. Practicalities: everything runs under hard vacuum, and a mass spectrometer is an inherently dirty instrument — you are burning samples inside it, and it needs regular cleaning and retuning.",
          "Sensitivity is mass spec's crown: LC-MS routinely reaches nanomolar to picomolar and sees 5,000–10,000 features per run. The humbling part: only about 5% of those features can currently be identified. You detect a forest and can name a grove.",
        ],
      },
    ],
    terms: [
      { term: "m/z", def: "Mass-to-charge ratio — what a mass spectrometer actually measures; at 1 ppm accuracy it yields the molecular formula." },
      { term: "MS/MS (tandem MS)", def: "Weigh, fragment, weigh again: fragment patterns are predictable fingerprints used for confident identification." },
      { term: "ESI / MALDI", def: "The two soft-ionization workhorses: electrospray from a charged nozzle; laser desorption from a matrix." },
      { term: "Triple quadrupole", def: "The world's most popular mass spectrometer — the targeted-quantitation machine behind clinical assays and newborn screening." },
    ],
    checks: [
      { q: "LC-MS sees 8,000 features in your serum run. Roughly how many will you identify, and why so few?", a: "On the order of 5% — a few hundred at best. Most features are dark matter with no database match; identification, not detection, is the bottleneck." },
      { q: "Why do targeted clinical assays run on triple quads rather than Orbitraps?", a: "Targeted work needs sensitive, robust, cheap quantitation of known compounds, not exact mass on unknowns — exactly the triple quad's trade." },
    ],
    reconLinks: [{ node: "mlims", label: "The LIMS that tracks every run" }],
  },
  {
    id: "nmr",
    number: 7,
    title: "NMR, the other pillar",
    kicker: "RINGING ALL THE BELLS AT ONCE",
    sections: [
      {
        paragraphs: [
          "Put a sample in a strong magnetic field and it becomes receptive to radio-frequency radiation; send in pulses and nuclei absorb at characteristic resonant frequencies. An NMR spectrum is those absorption bands. Magnets are named by frequency — a 600 MHz instrument — and bigger is better. The magnet is a niobium-tin superconducting coil charged once and kept at four kelvin, a giant thermos of liquid helium inside liquid nitrogen, with a probe and saddle coil in its bore doing the transmitting and receiving.",
          "Fourier-transform NMR (a 1960s Nobel) excites every resonance at once — ring all the bells, record the blended decaying chord (the free induction decay), then Fourier-transform time into frequency to recover every note. Three things then identify and quantify compounds: chemical shifts (the mileposts, set by nearby electronegative atoms), spin-spin coupling (doublets and triplets that count neighboring hydrogens), and intensities (proportional to proton count — with a DSS reference of known concentration, NMR is exquisitely quantitative).",
          "The history runs from Wilson and Burlingame's 1974 first metabolic NMR, through Shulman's cell studies, to Nicholson's 1984 urine spectrum that looked like a total mess and launched a field. A famous claim that NMR detects cancer in blood collapsed and soured a decade; from its ashes, Otvos noticed NMR is superb at lipoproteins — LipoScience sold for $85M and its FDA-approved test now runs 1.5 million samples a year.",
        ],
      },
      {
        heading: "STRENGTHS, LIMITS, AND LAB DISCIPLINE",
        paragraphs: [
          "NMR's virtues are operational: instruments last twenty years and rarely go down; the measurement is non-destructive (re-measure the same tube forever, even living systems — flux and kinetics in real time); it is highly quantitative; sample prep is minimal (people have peed straight into the NMR tube); and it sees what mass spec misses — sugars, alcohols, polyols. It is also the gold standard for identifying true unknowns; publication-grade structure elucidation still requires it. The cost: sensitivity around 5 micromolar, 50–100 compounds per biofluid — but essentially 100% of what NMR sees is identifiable, against LC-MS's ~5%. The methods overlap only ~10%, which is why serious labs run NMR, GC-MS, and LC-MS as complements and cross-checks.",
          "The protocol consensus, hard-won across labs: quench everything; filter urine at 0.22 microns and buffer it (urine ranges pH 4–10 and chemical shifts move with pH); reference with DSS, not the pH-sensitive TSP; add 5–10% D2O as lock solvent; never analyze whole blood — serum or plasma in additive-free tubes, with 3 kDa ultrafiltration to strip the lipoprotein hump; grind and extract tissues and plants after liquid-nitrogen quench; randomize run order rather than grouping by cohort; and collect the consensus 1D NOESY-presat at 600 MHz, 25°C, because the world's reference libraries were built that way. And the adoption law behind all of it: simpler, faster, cheaper wins; harder, longer, more expensive gets published and ignored.",
        ],
      },
    ],
    terms: [
      { term: "FID / Fourier transform", def: "The decaying chord recorded after exciting all resonances at once; the FT turns it back into individual frequencies." },
      { term: "Chemical shift", def: "A resonance's position (ppm), set by the electronic neighborhood — the milepost system for reading spectra." },
      { term: "DSS", def: "The chemical-shift and concentration reference standard of choice; TSP shifts with pH and is a poor substitute." },
      { term: "1D NOESY-presat", def: "The consensus pulse sequence for metabolomics — not the fanciest, but the one every reference library was collected with." },
    ],
    checks: [
      { q: "Only ~5% of LC-MS features are identifiable, but ~100% of NMR peaks are. Why?", a: "NMR's sensitivity floor (~5 µM) keeps it in the well-characterized, abundant part of the metabolome, where every compound has a reference spectrum. LC-MS's depth reaches into dark matter that no library covers." },
      { q: "Why buffer urine and insist on DSS over TSP?", a: "Urine spans pH 4–10 and chemical shifts move with pH — unbuffered samples defeat peak fitting; TSP's own shift is pH-dependent, corrupting the reference milepost itself." },
    ],
    reconLinks: [],
  },
  {
    id: "spectra-to-answers",
    number: 8,
    title: "From spectra to answers",
    kicker: "TARGETED VS UNTARGETED, ID LEVELS, AND DATA STANDARDS",
    sections: [
      {
        paragraphs: [
          "Two routes lead from spectra to science. The untargeted, chemometric route treats spectra as bags of peaks: multivariate statistics separate the classes, significant peaks light up — and you may never learn what those peaks are. It made sense when nobody knew what was in urine. The targeted, quantitative route — deconvolution — identifies and quantifies everything first, producing compound lists with concentrations that plug straight into pathway databases and biology. Now that the NMR-visible content of major biofluids is essentially fully catalogued, deconvolution is the modern standard; even the originators of the chemometric school have moved — yet two-thirds of NMR metabolomics papers still run the old way.",
          "Identification has formal rigor levels (the Metabolomics Standards Initiative): level 1, confirmed against an authentic standard — most mass-spec work never gets there; level 2, matched to a public database; level 3, putatively characterized to a class (lipidomics' 'PC 38:3' lives here); level 4, a real, reproducible, unknown peak. Journals increasingly require declaring your level per compound. A proper multi-peak NMR deconvolution — matching twenty or thirty chemical shifts and their intensity pattern at once — arguably meets level 1, and the community is pushing to recognize that.",
          "The data layer is standardizing too: nmrML is replacing 1987's JCAMP-DX as the interchange format, with reference spectra in HMDB and the BMRB, deconvolution tools from Chenomx to Bayesil, and archives — MetaboLights at the EBI, and the US Metabolomics Workbench — that journals expect deposits into, the GenBank and PDB of the field.",
        ],
      },
    ],
    terms: [
      { term: "Chemometrics (untargeted)", def: "Statistics over raw peak patterns: separates cohorts without identifying compounds — fast to signal, slow to meaning." },
      { term: "Deconvolution (targeted)", def: "Fit reference spectra of known compounds to the mixture: identify and quantify everything first, then do biology." },
      { term: "MSI levels 1–4", def: "The identification-rigor ladder: authentic standard > database match > compound class > honest unknown. Declare yours." },
      { term: "MetaboLights / Workbench", def: "The field's public archives; nmrML is the emerging interchange format for the spectra themselves." },
    ],
    checks: [
      { q: "Untargeted analysis found five peaks separating responders from non-responders. What's the catch?", a: "You don't know what they are — and identifying an unknown LC-MS feature can take years. The targeted route inverts the order: identify and quantify first, so significance lands on named biology." },
      { q: "A vendor's report calls every lipid 'identified'. What level are those IDs, really?", a: "Mostly MSI level 3 — putative class assignments like PC 38:3, without acyl positions. Honest reporting states the level per compound; level 1 needs an authentic standard." },
    ],
    reconLinks: [{ node: "graphrag", label: "Grounded retrieval in the recon" }],
  },
  {
    id: "implications",
    number: 9,
    title: "Implications for the platform",
    kicker: "WHAT THIS MEANS AT METABOLON — AND WHAT TO ASK",
    sections: [
      {
        paragraphs: [
          "Read the eight chapters back against the recon graph and the job stops being abstract. Metabolon industrializes exactly this pipeline — mass-spec metabolomics at scale — so every hard fact above becomes a software requirement somewhere in their stack. Samples are alive, so accessioning, chain of custody, and quench discipline are LIMS software problems, not lab trivia. Runs drift and instruments are dirty, so QC gating and batch correction are permanent features of the data plane, not cleanup scripts.",
          "The identification ladder is the deepest connection. MSI levels 1–4 are a confidence-gated curation problem: claims graded by evidence strength, with named tiers, where publishing a level-3 guess as a level-1 fact is the cardinal sin. That is structurally identical to the governance pattern in Astraea — deterministic gates, named failure modes, humans owning publication — and to this viewer's own JD/PUB/INF chips. A company whose product is trusted biological interpretation lives or dies by that discipline, and their reference spectral library — their equivalent of HMDB, built over two decades — is the crown-jewel data asset the software exists to protect and monetize.",
          "The lecture series is NMR-flavored; Metabolon is an LC-MS shop. Knowing both sides is the advantage: you understand why their coverage claims are phrased the way they are (the 5% identification reality), why targeted panels and untargeted discovery are different products with different QC (the two routes), and why the dark matter is simultaneously their scientific frontier and their backlog. And it frames the generative-AI question correctly: in a domain where hallucinated chemistry is disqualifying, AI belongs grounded in the curated structure — the library, the ontology, study metadata — answers as traversals over trusted data, never as recall.",
        ],
      },
      {
        heading: "CARRY THESE INTO THE ROOM",
        paragraphs: [
          "Which MSI identification level does each tier of the product report, and where does the platform enforce it? How is run-level QC gated before results reach the client portal — and can a human override the gate? What fraction of detected features ship as named compounds versus tracked unknowns, and is the dark-matter backlog a data asset anyone owns? Where would grounded retrieval over the reference library and ontology create product value first?",
        ],
      },
    ],
    terms: [
      { term: "LIMS", def: "Laboratory Information Management System — the software spine that tracks samples, runs, QC state, and chain of custody through the lab." },
      { term: "Batch effect", def: "Systematic drift between runs or instruments; correcting and gating it is a permanent feature of any industrial metabolomics platform." },
      { term: "Grounded retrieval", def: "Generative AI constrained to answer from curated structure — library, ontology, metadata — because hallucinated chemistry is disqualifying." },
    ],
    checks: [
      { q: "Why is a metabolomics company's reference library its crown jewel?", a: "Identification is the bottleneck of the whole field: a two-decade proprietary library of authentic-standard spectra is what turns undifferentiated features into named, billable, level-1 biology — and it compounds with every study run." },
      { q: "Map MSI levels onto a software governance pattern.", a: "Each claim carries an evidence tier; promotion between tiers requires named checks; publication is refused below the bar. Deterministic gates plus human adjudication — the same shape as confidence-gated curation in a knowledge graph." },
    ],
    reconLinks: [
      { node: "mlims", label: "The LIMS node" },
      { node: "graphrag", label: "Graph-grounded retrieval" },
    ],
  },
];
