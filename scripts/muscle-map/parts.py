# Individual muscles inside a muscle GROUP, for the views where the image shows them separately.
#
# The runtime tracks weekly dose per group (10 groups), so every part inherits its group's status colour.
# Parts exist so each visible muscle can be highlighted and selected on its own.
#
# Structure: PARTS[view][group][part_id] = { label, pieces: [left polygon, right polygon] }
# Seeds are polygons in the image's native 512 x 768 pixel space. They only have to sit well inside each
# muscle; a marker watershed over the image's grooves (see trace_masks.py) decides the exact seams.
# Piece 0 is the image-left half and piece 1 the image-right half, so a part never merges across the spine.
# The trapezius is split into thirds by fibre direction (its lower edge is a seam in the picture, its
# upper/mid boundary is convention), and the rhomboids lie beneath the mid trapezius so they share its region.

PARTS = {
    'back': {
        'back': {
         'upper_traps': {
           'label': 'Upper trapezius',
           'pieces': [
             [(236,113),(226,119),(214,127),(203,133),(197,137),(201,141),(213,143),(225,143),(233,138),(241,129),(245,119)],
             [(271,120),(277,114),(286,115),(298,123),(310,131),(319,136),(315,140),(303,143),(291,143),(281,139),(274,131)],
           ]},
         'mid_traps': {
           'label': 'Mid trapezius / rhomboids',
           'pieces': [
             [(230,151),(251,151),(251,178),(244,171),(236,163)],
             [(261,151),(282,151),(279,159),(272,167),(265,175),(261,178)],
           ]},
         'lower_traps': {
           'label': 'Lower trapezius',
           'pieces': [
             [(232,163),(237,170),(244,178),(252,186),(252,226),(248,223),(243,212),(238,199),(234,186),(232,174)],
             [(280,163),(275,170),(268,178),(260,186),(260,226),(264,223),(269,212),(274,199),(278,186),(280,174)],
           ]},
         'infraspinatus': {
           'label': 'Infraspinatus',
           'pieces': [
             [(194,154),(204,151),(215,152),(222,156),(223,168),(221,178),(212,177),(203,173),(195,168),(191,160)],
             [(291,155),(301,151),(312,152),(319,157),(321,167),(316,176),(306,180),(300,187),(297,196),(291,198),(285,197),(284,188),(284,174),(286,161)],
           ]},
         'teres_major': {
           'label': 'Teres major',
           'pieces': [
             [(189,188),(197,184),(206,184),(216,187),(221,192),(219,199),(211,203),(200,203),(192,199),(188,194)],
             [(298,189),(306,185),(316,185),(324,189),(327,195),(323,201),(314,204),(304,203),(298,198),(296,193)],
           ]},
         'lats': {
           'label': 'Latissimus dorsi',
           'pieces': [
             [(191,216),(204,209),(218,209),(228,211),(236,219),(243,232),(242,246),(238,256),(228,260),(214,258),(204,250),(198,238),(193,227)],
             [(321,216),(310,210),(296,208),(286,209),(277,213),(271,223),(269,236),(271,248),(277,257),(288,261),(302,259),(313,251),(320,239),(324,228)],
           ]},
         'erectors': {
           'label': 'Lower back (erector spinae)',
           'pieces': [
             [(213,273),(228,270),(240,265),(243,241),(252,239),(252,295),(240,295),(228,291),(217,285),(209,279)],
             [(299,273),(284,270),(272,265),(269,241),(260,239),(260,295),(272,295),(284,291),(295,285),(303,279)],
           ]},
        },
        'hamstrings': {
            # Two visible masses from behind: biceps femoris on the outer half, semitendinosus
            # and semimembranosus together on the inner half (they run too close together on this
            # picture to trace separately, so they share one part, same as mid_traps/rhomboids above).
            # Seeds trace the ONE real crease actually visible in this image (found via a black-hat
            # ridge filter, not guessed proportions): it runs roughly (183,390)->(192,435)->(184,478),
            # offset +-6px so the watershed (CLAHE on, real signal now that codex resculpted this)
            # has room to snap precisely to it instead of inheriting a straight seed line.
            'biceps_femoris': {
                'label': 'Biceps femoris (outer hamstring)',
                'pieces': [
                    [(168.0,390),(168.0,400),(168.0,412),(168.0,425),(168.0,435),(168.0,448),(168.0,465),(168.0,478),(168.0,488),(182.0,488),(178.0,478),(180.0,465),(183.0,448),(186.0,435),(185.0,425),(183.0,412),(180.0,400),(177.0,390)],
                    [(343.0,390),(343.0,400),(343.0,412),(343.0,425),(343.0,435),(343.0,448),(343.0,465),(343.0,478),(343.0,488),(329.0,488),(333.0,478),(331.0,465),(328.0,448),(325.0,435),(326.0,425),(328.0,412),(331.0,400),(334.0,390)],
                ],
            },
            'medial_hamstrings': {
                'label': 'Semitendinosus / semimembranosus (inner hamstring)',
                'pieces': [
                    [(189.0,390),(192.0,400),(195.0,412),(197.0,425),(198.0,435),(195.0,448),(192.0,465),(190.0,478),(194.0,488),(252.0,488),(252.0,478),(252.0,465),(252.0,448),(252.0,435),(252.0,425),(252.0,412),(252.0,400),(252.0,390)],
                    [(322.0,390),(319.0,400),(316.0,412),(314.0,425),(313.0,435),(316.0,448),(319.0,465),(321.0,478),(317.0,488),(259.0,488),(259.0,478),(259.0,465),(259.0,448),(259.0,435),(259.0,425),(259.0,412),(259.0,400),(259.0,390)],
                ],
            },
        },
    },
    'front': {
        'quads': {
            # Three visible heads, split as vertical-ish bands across the thigh: outer
            # (vastus lateralis), center (rectus femoris, over the front of the femur), inner
            # (vastus medialis, which bulges more just above the knee -- its seed widens there).
            # Not an even three-way split: vastus medialis is barely present high on the thigh and
            # bulges out low near the knee (its classic "teardrop"), rectus femoris is a fairly
            # constant-width band down the center, vastus lateralis takes the rest of the outer
            # sweep. Proportions (lateral/center/medial) move from 50/40/10 at the hip to 40/32/28
            # at the knee across the same four heights used elsewhere in this file.
            # A Y, not three parallel columns: the two real creases (found via a black-hat ridge
            # filter) run roughly (205,378)->(190,420) and (220,398)->(205,432), converging to a
            # point around (197,430) -- rectus femoris is a wedge that tapers out there, matching
            # where a hand-marked reference photo showed it actually ending. Below that point,
            # vastus lateralis and vastus medialis meet directly on one boundary down to the knee.
            # Everything offset +-6px from the real lines so the (CLAHE-on) watershed has room to
            # snap precisely instead of inheriting a straight seed line.
            'vastus_lateralis': {
                'label': 'Vastus lateralis (outer quad)',
                'pieces': [
                    [(168.0,378),(168.0,395),(168.0,410),(168.0,422),(168.0,430),(168.0,445),(168.0,460),(168.0,478),(168.0,485),(181.0,485),(183.6,478),(186.1,460),(188.7,445),(190.7,430),(183.5,422),(188.0,410),(193.6,395),(199.0,378)],
                    [(343.0,378),(343.0,395),(343.0,410),(343.0,422),(343.0,430),(343.0,445),(343.0,460),(343.0,478),(343.0,485),(330.0,485),(327.4,478),(324.9,460),(322.3,445),(320.3,430),(327.5,422),(323.0,410),(317.4,395),(312.0,378)],
                ],
            },
            'rectus_femoris': {
                'label': 'Rectus femoris (center quad)',
                'pieces': [
                    [(211.0,378),(205.6,395),(200.0,410),(195.5,422),(196.7,427),(203.1,422),(208.4,410),(215.4,395),(223.4,378)],
                    [(300.0,378),(305.4,395),(311.0,410),(315.5,422),(314.3,427),(307.9,422),(302.6,410),(295.6,395),(287.6,378)],
                ],
            },
            'vastus_medialis': {
                'label': 'Vastus medialis (inner quad)',
                'pieces': [
                    [(235.4,378),(227.4,395),(220.4,410),(215.1,422),(202.7,430),(200.7,445),(198.1,460),(195.6,478),(193.0,485),(248.0,485),(248.0,478),(248.0,460),(248.0,445),(248.0,430),(248.0,422),(248.0,410),(248.0,395),(248.0,378)],
                    [(275.6,378),(283.6,395),(290.6,410),(295.9,422),(308.3,430),(310.3,445),(312.9,460),(315.4,478),(318.0,485),(263.0,485),(263.0,478),(263.0,460),(263.0,445),(263.0,430),(263.0,422),(263.0,410),(263.0,395),(263.0,378)],
                ],
            },
        },
        'chest': {
            # The picture shows a faint diagonal crease near y=150-165 on each side: the seam between the
            # clavicular (upper) and sternal (lower) head of pectoralis major.
            'upper_chest': {
                'label': 'Upper chest (clavicular head)',
                'pieces': [
                    [(195, 142), (210, 140), (224, 140), (238, 143), (248, 150), (251, 158), (240, 160), (222, 158), (206, 156), (196, 152)],
                    [(315, 142), (300, 140), (286, 140), (272, 143), (262, 150), (259, 158), (270, 160), (288, 158), (304, 156), (314, 152)],
                ],
            },
            'lower_chest': {
                'label': 'Lower chest (sternal head)',
                'pieces': [
                    [(197, 163), (215, 167), (232, 169), (248, 168), (252, 175), (252, 205), (240, 211), (222, 213), (204, 209), (194, 198), (190, 180)],
                    [(313, 163), (295, 167), (278, 169), (262, 168), (258, 175), (258, 205), (270, 211), (288, 213), (306, 209), (316, 198), (320, 180)],
                ],
            },
        },
    },
}
