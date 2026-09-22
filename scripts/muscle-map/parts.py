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
        }
    },
}
