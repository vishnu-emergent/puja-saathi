// Ritual packs. Written once in English; Sarvam AI translates each pack into
// the devotee's language on first use (and the result is cached).
// Which pack a devotee gets is NOT decided here — it is the `ritual_pack`
// remote-config value from Flagsmith, chosen by segment (state × festival).
//
// These are simplified, home-friendly versions of each puja, written for
// someone doing it for the first time. Families vary; the guide says so.

export const RITUALS = {
  lakshmi_puja: {
    id: 'lakshmi_puja',
    title: 'Lakshmi Puja',
    festival: 'Deepavali',
    theme: 'lakshmi',
    duration: 35,
    intro:
      'Tonight we welcome Goddess Lakshmi into your home. I will guide you one step at a time. Take your time — there is no rush.',
    samagri: [
      'A low stool (chowki) and a red cloth',
      'A Lakshmi–Ganesha idol or picture',
      'A kalash with water, mango leaves and a coconut',
      'Clay diyas, ghee or oil, and cotton wicks',
      'Marigold or lotus flowers',
      'Kumkum, turmeric and a little uncooked rice',
      'Incense sticks and camphor',
      'Sweets, puffed rice and batashe',
      'A few coins',
      'An aarti plate and a small bell',
    ],
    steps: [
      {
        title: 'Prepare the space',
        text: 'Clean the place where you will do the puja. Draw a small rangoli at your door, then spread the red cloth on the chowki.',
        meaning: 'It is said Lakshmi only enters homes that are clean, bright and welcoming. The rangoli is your invitation at the door.',
      },
      {
        title: 'Set up the kalash',
        text: 'Fill the kalash with water. Add a coin, a pinch of rice and a flower. Place the mango leaves around the mouth and rest the coconut on top.',
        meaning: 'The kalash is a symbol of fullness — a pot that never runs dry. It holds the presence of the divine for the puja.',
      },
      {
        title: 'Place Ganesha and Lakshmi',
        text: 'Place the idols or picture of Lord Ganesha and Goddess Lakshmi side by side on the chowki. Put the kalash beside them.',
        meaning: 'Ganesha sits with Lakshmi because wealth without wisdom is incomplete. We pray to both together.',
      },
      {
        title: 'Light the diya',
        text: 'Light the ghee diya and two incense sticks. Place the diya in front of the goddess. Try to keep it burning through the night.',
        meaning: 'Deepavali means a row of lamps. Each flame stands for knowledge pushing away darkness.',
      },
      {
        title: 'Pray to Ganesha first',
        text: 'Fold your hands and offer a flower to Ganesha. Chant his mantra three times, slowly.',
        meaning: 'Every puja begins with Ganesha, the remover of obstacles, so that what follows goes smoothly.',
        mantra: { deva: 'ॐ गं गणपतये नमः', roman: 'Om Gam Ganapataye Namah' },
      },
      {
        title: 'Invoke Goddess Lakshmi',
        text: 'Offer flowers, a little kumkum, turmeric and rice to Lakshmi. Then chant her mantra with folded hands.',
        meaning: 'Kumkum and turmeric are signs of auspiciousness. Rice that is unbroken, akshat, stands for prosperity that does not break.',
        mantra: { deva: 'ॐ श्रीं महालक्ष्म्यै नमः', roman: 'Om Shreem Mahalakshmyai Namah' },
      },
      {
        title: 'Offer bhog',
        text: 'Place the sweets, puffed rice and batashe before the goddess. Keep the coins in front of her, and your account book or wallet if your family does.',
        meaning: 'Placing coins and account books before Lakshmi is a prayer that the year ahead is honest and abundant.',
      },
      {
        title: 'Do the aarti',
        text: 'Light the camphor on the aarti plate. Wave it in slow clockwise circles before the goddess while the family rings the bell and sings together.',
        meaning: 'Aarti is offering light back to the divine. Afterwards, everyone takes the warmth of the flame with their palms.',
      },
      {
        title: 'Light up your home',
        text: 'Carry diyas from the puja to your doorway, windows and every corner of the home. Then share the prasad with your family.',
        meaning: 'No corner should stay dark on Deepavali night. Sharing prasad completes the puja — blessings are meant to be shared.',
      },
    ],
    closing: 'Your puja is complete. Shubh Deepavali — may Lakshmi fill your home with light and abundance.',
  },

  kali_puja: {
    id: 'kali_puja',
    title: 'Kali Puja',
    festival: 'Deepavali night',
    theme: 'kali',
    duration: 40,
    intro:
      'Tonight, on the new moon, Bengal worships Ma Kali, the fierce mother who protects. I will guide you gently, step by step.',
    samagri: [
      'An image or picture of Ma Kali',
      'A red cloth for the altar',
      'A small earthen pot (ghot) with water and mango leaves',
      'Red hibiscus (joba) flowers',
      'Clay lamps (prodip), oil and wicks',
      'Sindoor, incense and a conch shell (shankha)',
      'Bhog: khichuri, luchi, sweets or fruits',
      'A small bell and an aarti lamp',
    ],
    steps: [
      {
        title: 'Prepare the altar',
        text: 'Clean the puja space and spread the red cloth. Place the picture of Ma Kali in the centre.',
        meaning: 'Red is the colour of shakti — energy and strength. The clean altar is a seat prepared for the mother.',
      },
      {
        title: 'Light the prodip',
        text: 'Light the clay lamps and place them around the altar and at your door. Many families light fourteen lamps for their ancestors.',
        meaning: 'This is the darkest night of the month. The lamps guide ancestors home and keep the darkness away.',
      },
      {
        title: 'Place the ghot',
        text: 'Fill the earthen pot with water, place the mango leaves on it, and draw a small swastika on it with sindoor. Place it before Ma Kali.',
        meaning: 'The ghot holds the presence of the goddess during the puja.',
      },
      {
        title: 'Offer to Ganesha and Shiva',
        text: 'Before beginning, offer one flower to Ganesha and one to Shiva, with folded hands.',
        meaning: 'Shiva lies at Kali’s feet in her images — her calm, her ground. We honour him first.',
      },
      {
        title: 'Invoke Ma Kali',
        text: 'Offer the red hibiscus flowers to Ma Kali, one at a time, and chant her mantra.',
        meaning: 'The joba flower is dearest to Ma Kali. Its deep red is her colour of courage.',
        mantra: { deva: 'ॐ क्रीं कालिकायै नमः', roman: 'Om Kreem Kalikayai Namah' },
      },
      {
        title: 'Offer bhog',
        text: 'Place the bhog before Ma Kali — khichuri, luchi, sweets or fruit, whatever your family offers.',
        meaning: 'Bhog is food offered with love; once blessed, it becomes prasad for everyone.',
      },
      {
        title: 'Aarti and shankha',
        text: 'Blow the conch three times. Then wave the aarti lamp in circles before Ma Kali while the bell rings.',
        meaning: 'The sound of the shankha is believed to clear negativity and announce the presence of the divine.',
      },
      {
        title: 'Pushpanjali',
        text: 'Take flowers in your folded hands, pray for courage and protection for your family, and offer the flowers at her feet.',
        meaning: 'Pushpanjali is an offering of flowers and of yourself — the most personal moment of the puja.',
      },
    ],
    closing: 'Your Kali Puja is complete. Shubho Kali Pujo — may Ma protect you and your family.',
  },

  karthigai_deepam: {
    id: 'karthigai_deepam',
    title: 'Karthigai Deepam',
    festival: 'Karthigai Deepam',
    theme: 'karthigai',
    duration: 30,
    intro:
      'Tonight, homes across Tamil Nadu glow with rows of lamps, for the great flame on the Thiruvannamalai hill. Let us light yours.',
    samagri: [
      'Clay agal vilakku lamps — as many as you like',
      'Ghee or sesame oil and cotton wicks',
      'Your kuthuvilakku (brass puja lamp)',
      'Rice flour for kolam',
      'Flowers and camphor',
      'Pori urundai, appam or adai for naivedyam',
    ],
    steps: [
      {
        title: 'Draw the kolam',
        text: 'Draw a kolam at your doorstep with rice flour. Leave space around it for lamps.',
        meaning: 'A rice-flour kolam welcomes guests and feeds the ants and birds — a small act of generosity at the threshold.',
      },
      {
        title: 'Arrange the agal lamps',
        text: 'Place the clay lamps in rows — at the entrance, on the steps, along the windows and around the kolam.',
        meaning: 'Rows of lamps mirror the countless lights seen on the Thiruvannamalai hill on this night.',
      },
      {
        title: 'Fill the lamps',
        text: 'Pour ghee or sesame oil into each lamp and place a cotton wick so it rests on the edge.',
        meaning: 'Oil and wick are the body and the breath — together they hold the flame.',
      },
      {
        title: 'Light the puja lamp first',
        text: 'Light the kuthuvilakku at your puja shelf before any other lamp. Offer flowers to it.',
        meaning: 'All the other flames are lit from this one, as all light comes from one source.',
      },
      {
        title: 'Pray to Lord Shiva',
        text: 'Fold your hands before the lamp and chant the mantra, thinking of Arunachala.',
        meaning: 'The legend says Shiva appeared as an endless column of fire. The Maha Deepam on the hill celebrates that light.',
        mantra: { deva: 'ॐ नमः शिवाय', roman: 'Om Namah Shivaya' },
      },
      {
        title: 'Light every lamp',
        text: 'From the puja lamp, light the agal lamps one by one, moving outward from the puja room to your doorstep.',
        meaning: 'Moving outward from the shelf to the street carries the light from your prayer into the world.',
      },
      {
        title: 'Offer naivedyam',
        text: 'Offer the pori urundai, appam or adai at the puja shelf, and show camphor aarti.',
        meaning: 'Pori urundai — puffed rice with jaggery — is the special offering of this festival.',
      },
    ],
    closing: 'Your home is glowing. Happy Karthigai Deepam — may this light stay with you.',
  },

  pongal: {
    id: 'pongal',
    title: 'Thai Pongal',
    festival: 'Thai Pongal',
    theme: 'pongal',
    duration: 45,
    intro:
      'Good morning! Today we thank the Sun for the harvest by cooking pongal in a new pot until it boils over. Let us begin.',
    samagri: [
      'A new clay or brass pot',
      'A fresh turmeric plant and a few sugarcane stalks',
      'Rice, moong dal, milk and water',
      'Jaggery, ghee, cashews, raisins and cardamom',
      'Banana leaf, bananas and a coconut',
      'Rice flour for a big kolam',
    ],
    steps: [
      {
        title: 'Draw the kolam',
        text: 'Draw a big, bright kolam in front of your home. Stand two sugarcane stalks beside it.',
        meaning: 'Pongal kolams are the biggest of the year — a welcome for the harvest and the new month of Thai.',
      },
      {
        title: 'Dress the new pot',
        text: 'Tie the fresh turmeric plant around the neck of the new pot. Draw a little kolam on it.',
        meaning: 'A new pot for a new beginning. Turmeric stands for health and auspiciousness.',
      },
      {
        title: 'Boil the milk',
        text: 'Place the pot facing the sun, pour in milk and water, and light the fire. Gather the family around.',
        meaning: 'The pot is cooked in the open, facing the Sun, because this meal is first an offering to him.',
      },
      {
        title: 'Pongalo Pongal!',
        text: 'When the milk boils over the rim, everyone shouts “Pongalo Pongal!” together. Notice which side it spills.',
        meaning: 'The overflowing milk is abundance itself — a year that spills over with plenty.',
      },
      {
        title: 'Cook the sakkarai pongal',
        text: 'Add the rice and moong dal and cook until soft. Stir in jaggery, then ghee, cashews, raisins and cardamom.',
        meaning: 'Sweet pongal is made with the new harvest’s rice and the season’s jaggery.',
      },
      {
        title: 'Offer to Surya',
        text: 'Serve the pongal on a banana leaf with sugarcane, bananas and coconut. Place it facing the sun.',
        meaning: 'Thai Pongal is thanksgiving to Surya, who made the harvest possible.',
        mantra: { deva: 'ॐ सूर्याय नमः', roman: 'Om Suryaya Namah' },
      },
      {
        title: 'Share the pongal',
        text: 'Show camphor aarti to the sun, then share pongal with family and neighbours.',
        meaning: 'The harvest is never eaten alone — sharing it is the heart of the festival.',
      },
    ],
    closing: 'Pongal is ready and the year has begun sweetly. Iniya Pongal Nalvazhthukkal!',
  },

  lohri: {
    id: 'lohri',
    title: 'Lohri',
    festival: 'Lohri',
    theme: 'lohri',
    duration: 40,
    intro:
      'Tonight we gather around the Lohri fire to thank it for the harvest and the end of winter. Let us get started.',
    samagri: [
      'Dry wood and cow-dung cakes for the bonfire',
      'Til (sesame) and gur (jaggery)',
      'Rewri, gajak and peanuts',
      'Popcorn',
      'A plate to carry the offerings',
    ],
    steps: [
      {
        title: 'Build the fire',
        text: 'Stack the wood in an open space, away from wires and vehicles, with the cow-dung cakes at the base.',
        meaning: 'The Lohri fire marks the end of the coldest nights, and the sun’s return north.',
      },
      {
        title: 'Prepare the offerings',
        text: 'Fill a plate with til, gur, rewri, gajak, peanuts and popcorn for everyone to share.',
        meaning: 'Sesame and jaggery warm the body in winter — they are the season’s gift.',
      },
      {
        title: 'Light the bonfire',
        text: 'At dusk, light the fire together with the family. Bow your head before the flames.',
        meaning: 'Agni, the fire, is the messenger who carries our offerings to the gods.',
      },
      {
        title: 'Walk the parikrama',
        text: 'Walk around the fire in a circle, tossing a little til, popcorn and rewri into the flames as you go.',
        meaning: 'Each offering into the fire is a prayer for a good harvest and a full home.',
      },
      {
        title: 'Sing Sunder Mundriye',
        text: 'Sing “Sunder mundriye ho!” together. The elders can tell the story of Dulla Bhatti.',
        meaning: 'Dulla Bhatti was a folk hero who protected young girls. His song is the heart of every Lohri.',
      },
      {
        title: 'Celebrate the firsts',
        text: 'If there is a newlywed or a newborn in the family, bring them close to the fire for a special blessing.',
        meaning: 'A first Lohri is a big celebration — the fire blesses new beginnings in the family.',
      },
      {
        title: 'Share the prasad',
        text: 'Share the rewri, gajak and peanuts, and sit down together for makki di roti and sarson da saag.',
        meaning: 'Lohri ends where every Punjabi festival ends — at a full table.',
      },
    ],
    closing: 'Lohri diyan lakh lakh vadhaiyan! May the year ahead be warm and full.',
  },
};

export const RITUAL_IDS = Object.keys(RITUALS);
