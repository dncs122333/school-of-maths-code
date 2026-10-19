"""Official CBSE Rationalized NCERT Curriculum Taxonomy for Class 9 and 10 (Maths & Science).

Used for:
1. Strict topic alignment when ingesting question banks (prevents topic fragmentation).
2. Supplying the exact approved topic list in Gemini prompts for teachers.
3. Pre-populating topic filters in Chapterwise Test Studio.
"""

CURRICULUM = {
    "9": {
        "Maths": {
            "Number Systems": [
                "Review of natural numbers, integers, rational numbers on the number line",
                "Rational numbers as recurring/terminating decimals; non-recurring, non-terminating decimals",
                "Irrational numbers (√2, √3 etc.) and their existence; real numbers",
                "Operations on real numbers",
                "nth root of a real number",
                "Rationalization of 1/(a+b√x) and 1/(√x+√y) types",
                "Laws of exponents with integral powers; rational (fractional) exponents"
            ],
            "Polynomials": [
                "Definition of a polynomial in one variable (with examples/counter-examples)",
                "Coefficients, terms, zero polynomial",
                "Degree of a polynomial",
                "Types: constant, linear, quadratic, cubic; monomials, binomials, trinomials",
                "Factors and multiples; zeroes of a polynomial",
                "Remainder Theorem (motivate and state, with examples)",
                "Factor Theorem (statement and proof)",
                "Factorization of quadratic polynomials ax² + bx + c and cubic polynomials using the Factor Theorem",
                "Algebraic identities (including cubic identities) and their use in factorization"
            ],
            "Coordinate Geometry": [
                "The Cartesian plane",
                "Coordinates of a point",
                "Names, terms and notations associated with the coordinate plane (x-axis, y-axis, origin, abscissa, ordinate, quadrants)"
            ],
            "Linear Equations in Two Variables": [
                "Recall of linear equations in one variable",
                "Introduction to linear equations of the type ax + by + c = 0",
                "Idea that a linear equation in two variables has infinitely many solutions, written as ordered pairs of real numbers"
            ],
            "Introduction to Euclid's Geometry": [
                "History of geometry in India and Euclid's contribution",
                "Euclid's axioms (common notions) and definitions",
                "Euclid's five postulates",
                "Theorems and the process of logical deduction; relationship between axioms and theorems"
            ],
            "Lines and Angles": [
                "Basic terms and definitions: line, line segment, ray, collinear points, angles (acute, obtuse, right, straight, reflex)",
                "Intersecting lines and non-intersecting lines",
                "Pairs of angles: complementary, supplementary, adjacent, linear pair, vertically opposite angles",
                "Axioms on linear pairs and vertically opposite angles"
            ],
            "Triangles": [
                "Congruence of figures; congruence of triangles",
                "Congruence rules: SAS, ASA, AAS, SSS; RHS congruence for right triangles",
                "Properties related to isosceles triangles",
                "Some more properties of triangles; proving properties learnt earlier"
            ],
            "Quadrilaterals": [
                "Properties of a parallelogram (opposite sides equal, opposite angles equal, diagonals bisect each other)",
                "Conditions for a quadrilateral to be a parallelogram",
                "The Mid-point Theorem (and its converse)"
            ],
            "Circles": [
                "Circle and related terms: radius, circumference, diameter, chord, arc, secant, sector, segment, subtended angle",
                "Angle subtended by a chord at a point",
                "Equal chords subtend equal angles at the centre (and converse)",
                "Perpendicular from the centre to a chord bisects the chord (and converse)",
                "Equal chords are equidistant from the centre (and converse)",
                "Angle subtended by an arc at the centre is double the angle at any point on the remaining part",
                "Angles in the same segment of a circle are equal",
                "Cyclic quadrilateral: sum of opposite angles is 180° (and converse)"
            ],
            "Heron's Formula": [
                "Area of a triangle using Heron's Formula (when all three sides are known)",
                "Application of Heron's Formula in finding the area of a triangle"
            ],
            "Surface Areas and Volumes": [
                "Surface area of a sphere, hemisphere, and a right circular cone",
                "Volume of a sphere, hemisphere, and a right circular cone"
            ],
            "Statistics": [
                "Introduction to statistics",
                "Presentation of data: frequency distribution tables",
                "Graphical representation of data: bar graphs, histograms (with varying base lengths), frequency polygons",
                "Mean, median and mode of ungrouped data"
            ]
        },
        "Science": {
            "Matter in Our Surroundings": [
                "Definition of matter; characteristics of particles of matter",
                "States of matter: solid, liquid, gas (properties and differences)",
                "Evaporation and factors affecting it (surface area, temperature, humidity, wind speed)",
                "Condensation and sublimation",
                "Effect of change of temperature and pressure on states of matter",
                "Interconversion of states of matter; plasma and Bose-Einstein condensate (only awareness)"
            ],
            "Is Matter Around Us Pure": [
                "Elements, compounds and mixtures",
                "Types of mixtures: homogeneous and heterogeneous",
                "Solutions — properties, solubility, saturated and unsaturated solutions",
                "Concentration of solutions (mass by mass, mass by volume percentage)",
                "Suspensions and colloids (Tyndall effect, properties)",
                "Separation of components of a mixture: evaporation, centrifugation, decantation, filtration, distillation, fractional distillation, crystallization",
                "Separating a mixture of two immiscible liquids; separating a mixture of two miscible liquids (fractional distillation)",
                "Chromatography and its applications",
                "Physical and chemical changes"
            ],
            "Atoms and Molecules": [
                "Laws of chemical combination: law of conservation of mass (Lavoisier), law of constant proportions (Proust)",
                "What is an atom? Dalton's atomic theory",
                "Atomic mass and relative atomic mass",
                "Molecule of elements and compounds; atomicity",
                "What is an ion; writing chemical formulae",
                "Molecular mass and formula unit mass",
                "Mole concept and Avogadro's number"
            ],
            "Structure of the Atom": [
                "Charged particles in matter; discovery of the electron (Thomson's experiments) and proton (Goldstein)",
                "Structure of an atom: Thomson's model and its limitations",
                "Rutherford's model (alpha-particle scattering) and its limitations",
                "Bohr's model of an atom",
                "Neutrons and the distribution of electrons (shells/energy levels)",
                "Valency; atomic number and mass number",
                "Isotopes and isobars (uses of isotopes: C-14 for dating, U-235 for nuclear energy, I-131 in medicine)"
            ],
            "The Fundamental Unit of Life": [
                "What are living organisms made of? Cell discovery (Robert Hooke)",
                "Structural organisation of a cell: plasma membrane, cell wall, nucleus, cytoplasm",
                "Cell organelles: endoplasmic reticulum, Golgi apparatus, lysosomes, mitochondria, plastids, vacuoles",
                "Prokaryotic vs. eukaryotic cells"
            ],
            "Tissues": [
                "What is tissue and its need in multicellular organisms",
                "Plant tissues: meristematic and permanent tissues (parenchyma, collenchyma, sclerenchyma)",
                "Complex permanent tissues: xylem and phloem",
                "Animal tissues: epithelial, connective, muscular, nervous tissues (structure, location and function)"
            ],
            "Motion": [
                "Describing motion: uniform and non-uniform motion (along a straight line)",
                "Measuring the rate of motion: speed, velocity, average speed and velocity",
                "Rate of change of velocity — acceleration",
                "Graphical representation of motion: distance-time and velocity-time graphs",
                "Equations of motion (derivation using graphs): v = u + at, s = ut + ½at², v² − u² = 2as",
                "Uniform circular motion"
            ],
            "Force and Laws of Motion": [
                "Balanced and unbalanced forces",
                "First law of motion and inertia; mass and inertia",
                "Second law of motion; momentum; F = ma; mathematical formulation",
                "Third law of motion with examples",
                "Conservation of momentum (derivation and applications)"
            ],
            "Gravitation": [
                "What is gravity? Gravitation and free fall",
                "Universal law of gravitation (statement and numericals)",
                "Motion of objects under the influence of gravitational force of the earth — acceleration due to gravity (g) and its variation",
                "Mass and weight; weight on the moon",
                "Thrust and pressure; pressure in fluids; atmospheric pressure",
                "Buoyancy; why objects float or sink; Archimedes' principle",
                "Relative density and its applications"
            ],
            "Work and Energy": [
                "Work done by a force (positive, negative and zero work)",
                "Energy and its forms: kinetic energy, potential energy",
                "Kinetic energy expression (KE = ½mv²); potential energy expression (PE = mgh)",
                "Law of conservation of energy; power (P = W/t)",
                "Commercial unit of energy (kilowatt hour) and numericals"
            ],
            "Sound": [
                "Production and propagation of sound; sound needs a medium",
                "Types of waves: longitudinal and transverse; compression and rarefaction",
                "Characteristics of a sound wave: frequency, amplitude, speed",
                "Reflection of sound; echo and reverberation",
                "Uses of multiple reflections (megaphone, stethoscope, etc.)",
                "Range of hearing (20 Hz–20 kHz); ultrasound and its applications (SONAR, cleaning, imaging)",
                "Structure of the human ear (only labelled diagram/awareness)"
            ],
            "Why Do We Fall Ill?": [
                "Health and its failure; disease and its causes",
                "Infectious and non-infectious diseases",
                "Means of spread of infectious diseases: air, water, food, physical contact, vectors",
                "Organ-specific and tissue-specific manifestations",
                "Principles of treatment and principles of prevention",
                "Immunity (basic concept); vaccination"
            ]
        }
    },
    "10": {
        "Maths": {
            "Real Numbers": [
                "Fundamental Theorem of Arithmetic (proofs of irrationality of √2, √3, √5)",
                "Revisiting rational numbers and their decimal expansions; terminating and non-terminating recurring decimals",
                "HCF and LCM via prime factorization and Euclid's division algorithm"
            ],
            "Polynomials": [
                "Zeros of a polynomial",
                "Relationship between zeros and coefficients of quadratic polynomials (statement only, no derivation required)",
                "Division algorithm for polynomials with real coefficients (statement and simple problems)"
            ],
            "Pair of Linear Equations in Two Variables": [
                "Pair of linear equations in two variables and graphical method of solution (consistent/inconsistent pairs, intersecting/parallel/coincident lines)",
                "Algebraic methods of solving: substitution, elimination, and cross-multiplication",
                "Equations reducible to a pair of linear equations in two variables (word problems — boats, speed, age, digit, money problems)",
                "Simple situational problems"
            ],
            "Quadratic Equations": [
                "Standard form of a quadratic equation ax² + bx + c = 0 (a ≠ 0)",
                "Solutions of quadratic equations by factorization and by quadratic formula",
                "Relationship between discriminant and nature of roots",
                "Situational problems based on quadratic equations (problems on numbers, areas, time and work, etc.)"
            ],
            "Arithmetic Progressions": [
                "Motivation for studying AP; derivation of the nth term and sum of the first n terms of an AP",
                "Application in solving daily life problems (word problems)"
            ],
            "Triangles": [
                "Definitions, examples, counter-examples of similar triangles",
                "(Prove) Basic Proportionality Theorem (Thales theorem): line parallel to one side divides other two sides proportionally; converse (motivated)",
                "(Motivate) AAA, SSS, SAS similarity criteria",
                "(Motivate) Right triangle altitude theorem (similarity relations on the hypotenuse)",
                "(Prove) Ratio of areas of two similar triangles = ratio of squares of corresponding sides",
                "(Prove) Pythagoras theorem and its converse",
                "Simple problems on similar triangles"
            ],
            "Coordinate Geometry": [
                "Review of concepts of coordinate geometry (Class 9)",
                "Distance formula; section formula (internal division); midpoint formula",
                "Area of a triangle (formula and problems)"
            ],
            "Introduction to Trigonometry": [
                "Trigonometric ratios of an acute angle of a right-angled triangle (sin, cos, tan, cosec, sec, cot)",
                "Proof of their existence (motivate) and well-definedness; values of trigonometric ratios of 30°, 45°, 60°",
                "Relationships between the ratios (identities): sin²θ + cos²θ = 1 etc. (proof and problems)",
                "Trigonometric ratios of complementary angles"
            ],
            "Some Applications of Trigonometry": [
                "Heights and distances (line of sight, angle of elevation, angle of depression)",
                "Simple problems on heights and distances involving not more than two right triangles; angles of elevation/depression limited to 30°, 45°, 60°"
            ],
            "Circles": [
                "Tangent to a circle at a point of contact",
                "(Prove) Tangent at any point of a circle is perpendicular to the radius through the point of contact",
                "(Prove) Lengths of tangents drawn from an external point to a circle are equal",
                "Problems based on the above"
            ],
            "Areas Related to Circles": [
                "Area of sectors and segments of a circle",
                "Problems based on areas and perimeter/circumference of plane figures (circles combined with triangles, squares etc.)",
                "Area of a segment (quadrant, semicircle problems)"
            ],
            "Surface Areas and Volumes": [
                "Surface areas and volumes of combinations of any two of the following: cube, cuboid, sphere, hemisphere, cylinder, cone",
                "Problems involving converting one type of metallic solid into another and other mixed problems"
            ],
            "Statistics": [
                "Mean, median and mode of grouped data (bimodal situation to be avoided)",
                "Cumulative frequency graph — less than type, more than type ogives",
                "Mean by direct method, assumed mean method, and step deviation method"
            ]
        },
        "Science": {
            "Chemical Reactions and Equations": [
                "Chemical reactions and how to write chemical equations",
                "Balancing chemical equations",
                "Types of chemical reactions: combination, decomposition, displacement, double displacement",
                "Precipitation and neutralization reactions",
                "Oxidation and reduction (redox) reactions with examples",
                "Effects of oxidation reactions in everyday life: corrosion and rancidity"
            ],
            "Acids, Bases and Salts": [
                "Acids and bases: definition in terms of H⁺ and OH⁻ ions",
                "General properties, examples and uses of acids and bases",
                "Indicators (litmus, turmeric, China rose) and neutralization",
                "Acids and bases in water — ionization; reaction with metals and metal oxides",
                "Concept of pH scale (logarithm not required); importance of pH in everyday life",
                "More about salts: families of salts, pH of salts",
                "Chemicals from common salt: sodium hydroxide (chlor-alkali process), bleaching powder, baking soda, washing soda, and plaster of Paris"
            ],
            "Metals and Non-metals": [
                "Physical properties of metals and non-metals",
                "Chemical properties: reactions with oxygen, water, acids and other metal salts",
                "Reactivity series of metals and displacement reactions",
                "Extraction of metals: occurrence of metals, enrichment of ores; extraction of metals of low/middle/high reactivity",
                "Refining of metals",
                "Corrosion of iron and its prevention; examples of corrosion (rusting, tarnishing of silver, green coating on copper)"
            ],
            "Carbon and its Compounds": [
                "Bonding in carbon — covalent bonding; versatile nature of carbon (catenation, tetravalency)",
                "Saturated and unsaturated carbon compounds",
                "Homologous series; nomenclature of carbon compounds",
                "Functional groups (halogens, alcohols, ketones, aldehydes, alkenes, alkynes); isomerism",
                "Chemical properties: combustion, oxidation, addition and substitution reactions",
                "Ethanol and ethanoic acid — properties and uses",
                "Soaps and detergents: cleansing action and difference between them"
            ],
            "Life Processes": [
                "What are life processes; need for nutrition, respiration, transportation and excretion",
                "Nutrition in human beings: alimentary canal and digestive system (nutrition in plants briefly: photosynthesis)",
                "Respiration: aerobic and anaerobic respiration; human respiratory system",
                "Transportation: human circulatory system (heart, blood, blood vessels); transportation in plants (xylem and phloem)",
                "Excretion: human excretory system; excretion in plants"
            ],
            "Control and Coordination": [
                "Nervous system: neurons and their functioning; reflex actions and reflex arc",
                "Human brain: parts and functions (forebrain, midbrain, hindbrain); protection of brain and spinal cord",
                "Chemical coordination: hormones; endocrine glands and their functions",
                "Hormones in animals: growth hormone, thyroid, adrenaline, insulin (role of insulin in diabetes)"
            ],
            "How do Organisms Reproduce?": [
                "Modes of reproduction: asexual and sexual",
                "Asexual reproduction: fission, fragmentation, regeneration, budding, vegetative propagation, spore formation",
                "Sexual reproduction in flowering plants: pollination and fertilization",
                "Sexual reproduction in human beings: male and female reproductive systems",
                "Reproductive health: need for safe sex and contraception; methods of contraception"
            ],
            "Heredity": [
                "Accumulation of variation during reproduction",
                "Heredity vs variation; inherited and acquired traits",
                "Mendel's contribution: laws of inheritance, dominant and recessive traits; monohybrid and dihybrid ratios (F₁ and F₂)",
                "Sex determination in human beings"
            ],
            "Light – Reflection and Refraction": [
                "Laws of reflection; image formation by plane and spherical mirrors",
                "Mirror formula and magnification (numericals)",
                "Refraction of light; laws of refraction (Snell's law); refractive index",
                "Image formation by lenses; lens formula and magnification; power of a lens (dioptre)",
                "Problems on combination of thin lenses in contact"
            ],
            "Human Eye and the Colourful World": [
                "Human eye: structure and functioning; power of accommodation",
                "Defects of vision — myopia and hypermetropia — and their correction using lenses",
                "Refraction of light through a prism; dispersion of light; formation of rainbow",
                "Atmospheric refraction: twinkling of stars, advance sunrise and delayed sunset",
                "Scattering of light (blue sky, colour of sun at sunrise/sunset)"
            ],
            "Electricity": [
                "Electric current and circuit; electric potential and potential difference",
                "Ohm's law: V = IR; resistance and resistivity; factors affecting resistance",
                "Series and parallel combination of resistors; numericals",
                "Heating effect of electric current; electric power; P = VI; commercial unit of energy (kWh) and problems"
            ],
            "Magnetic Effects of Electric Current": [
                "Magnetic field and field lines; magnetic field due to a current-carrying straight conductor",
                "Right-hand thumb rule; magnetic field due to a current-carrying circular loop and solenoid",
                "Force on a current-carrying conductor in a magnetic field; Fleming's left-hand rule",
                "Electric motor and its working",
                "Electromagnetic induction; Fleming's right-hand rule; electric generator (AC and DC)",
                "Domestic electric circuits: earthing; safety devices (fuse, MCB)"
            ]
        }
    }
}


def get_canonical_topics(class_level: str, subject: str, chapter: str) -> list:
    """Returns canonical topics for a given class, subject, and chapter, if defined."""
    cl = str(class_level).strip()
    subj = (subject or "").strip()
    chap = (chapter or "").strip()
    
    # Try exact match
    cl_dict = CURRICULUM.get(cl, {})
    # Match subject (case-insensitive)
    for s_name, chaps in cl_dict.items():
        if s_name.lower() == subj.lower() or (s_name.lower() == "maths" and "math" in subj.lower()):
            for c_name, topics in chaps.items():
                if c_name.lower() == chap.lower() or c_name.lower().replace("-", " ") == chap.lower().replace("-", " "):
                    return topics
    return []


def generate_gemini_prompt(class_level: str, subject: str, chapter: str) -> str:
    """Generates the exact, deterministic prompt to give to the Gemini App."""
    topics = get_canonical_topics(class_level, subject, chapter)
    topics_formatted = "\n".join(f"  - \"{t}\"" for t in topics) if topics else "  - [Extract main concepts cleanly]"

    return f"""You are a senior CBSE curriculum digitization specialist for VidyaLab.

TASK:
Convert the provided question paper / questions into our exact VidyaLab question bank JSON format.

CRITICAL TOPIC RESTRICTION (MANDATORY):
To ensure database consistency and avoid fragmented analytics, each question's `topics` array MUST ONLY contain topics chosen from this APPROVED LIST for this chapter. DO NOT invent or paraphrase new topic names:

APPROVED TOPICS FOR {chapter.upper()} (CLASS {class_level} {subject.upper()}):
{topics_formatted}

INSTRUCTIONS:
1. Every question must be classified with 1 to 2 exact topics from the approved list above.
2. For each question, extract:
   - `question`: Complete question text. Use LaTeX formatting for mathematical expressions like $ax^2 + bx + c = 0$ or fractions $\\frac{{a}}{{b}}$.
   - `options`: Array of option strings (e.g. 4 options).
   - `correct_answer`: The exact text of the correct option or option letter ("A", "B", "C", "D").
   - `explanation`: Clear step-by-step NCERT reasoning/formula derivation.
   - `difficulty`: "easy", "medium", or "hard".
   - `marks`: Positive marks (e.g. 1 or 4).
   - `negative_marks`: Negative marks penalty if any (e.g. 0 or 1).
   - `hint`: Optional brief formula hint.
   - `tags`: Array of labels, e.g. ["NCERT", "CBSE PYQ"].
3. Output ONLY the raw JSON block without any extra conversation or markdown preamble.

TARGET JSON FORMAT:
```json
{{
  "class_level": "{class_level}",
  "subject": "{subject}",
  "chapter": "{chapter}",
  "questions": [
    {{
      "question": "Sample question text here with $x^2$ notation",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "correct_answer": "Option 1",
      "explanation": "Step-by-step mathematical reasoning.",
      "topics": [{f'"{topics[0]}"' if topics else '"Main Topic"'}],
      "difficulty": "medium",
      "marks": 1,
      "negative_marks": 0,
      "hint": "Formula hint here",
      "tags": ["NCERT"]
    }}
  ]
}}
```

QUESTION PAPER / MATERIAL TO DIGITIZE:
[PASTE QUESTION PAPER TEXT OR ATTACH PDF/IMAGE HERE]
"""
