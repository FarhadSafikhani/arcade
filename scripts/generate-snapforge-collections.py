"""Regenerate the themed Snapforge models from compact voxel sculptures."""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'src/games/snapforge/levels'

class Model:
    def __init__(self, id, title, collection, order, description, palette):
        self.id, self.title, self.collection = id, title, collection
        self.order, self.description, self.palette = order, description, palette
        self.cells = {}

    def box(self, x0, x1, y0, y1, z0, z1, color):
        for z in range(z0, z1):
            for y in range(y0, y1):
                for x in range(x0, x1):
                    self.cells[x, y, z] = color
        return self

    def bricks(self):
        # Each brick needs one stud beneath it; a whole overhang need not become a wall.
        def slices(cells):
            result = []
            for z in sorted({cell[2] for cell in cells}):
                layer = {cell: color for cell, color in cells.items() if cell[2] == z}
                while layer:
                    x, y, _ = min(layer, key=lambda cell: (cell[1], cell[0]))
                    color = layer[x, y, z]
                    w = 1
                    while w < 2 and layer.get((x + w, y, z)) == color: w += 1
                    d = 1
                    while d < 2 and all(layer.get((xx, y + d, z)) == color for xx in range(x, x + w)): d += 1
                    for yy in range(y, y + d):
                        for xx in range(x, x + w): del layer[xx, yy, z]
                    result.append(dict(x=x, y=y, z=z, w=w, d=d, color=color))
            return result

        while True:
            unsupported = []
            for brick in slices(self.cells):
                if brick['z'] == 0: continue
                if not any((x, y, brick['z'] - 1) in self.cells
                           for x in range(brick['x'], brick['x'] + brick['w'])
                           for y in range(brick['y'], brick['y'] + brick['d'])):
                    unsupported.append(brick)
            if not unsupported: break
            for brick in unsupported:
                self.cells[brick['x'], brick['y'], brick['z'] - 1] = brick['color']

        # Small rectangular bricks retain detail while keeping builds manageable.
        remaining = dict(self.cells)
        parts = []
        for z in sorted({cell[2] for cell in remaining}):
            layer = {cell: color for cell, color in remaining.items() if cell[2] == z}
            while layer:
                x, y, _ = min(layer, key=lambda cell: (cell[1], cell[0]))
                color = layer[x, y, z]
                w = 1
                while w < 2 and layer.get((x + w, y, z)) == color: w += 1
                d = 1
                while d < 2 and all(layer.get((xx, y + d, z)) == color for xx in range(x, x + w)): d += 1
                for yy in range(y, y + d):
                    for xx in range(x, x + w): del layer[xx, yy, z]
                parts.append(dict(x=x, y=y, z=z, w=w, d=d, color=color))
        by_shape = {(b['x'], b['y'], b['z'], b['w'], b['d'], b['color']): b for b in parts}
        bricks = []
        used = set()
        for b in parts:
            key = (b['x'], b['y'], b['z'], b['w'], b['d'], b['color'])
            if key in used: continue
            used.add(key)
            above = (b['x'], b['y'], b['z'] + 1, b['w'], b['d'], b['color'])
            result = dict(b)
            if above in by_shape and above not in used:
                result['h'] = 2
                used.add(above)
            bricks.append(result)
        for i, b in enumerate(bricks, 1):
            b['id'] = f'brick-{i:03}'
        return bricks

    def save(self):
        data = dict(id=self.id, title=self.title, description=self.description,
                    collection=self.collection, order=self.order, version=1,
                    palette=self.palette, bricks=self.bricks())
        (OUT / f'{self.id}.json').write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
        print(f'{self.collection:12} {self.title:16} {len(data["bricks"]):3} bricks')

def animal(id, title, order, main, accent, feature):
    m = Model(id, title, 'land-animal', order, f'Build a brick-built {title.lower()}.',
              dict(main=main, accent=accent, dark='#27334D', light='#FFF9E7'))
    m.box(2, 8, 1, 5, 2, 5, 'main')
    for x in (2, 6):
        for y in (1, 4): m.box(x, x+2, y, y+1, 0, 3, 'main')
    m.box(7, 10, 1, 5, 3, 7, 'main').box(9, 10, 2, 4, 4, 5, 'accent')
    m.box(8, 9, 1, 2, 5, 6, 'dark').box(8, 9, 4, 5, 5, 6, 'dark')
    if feature == 'rabbit':
        m.box(7, 8, 1, 2, 6, 9, 'main').box(8, 9, 4, 5, 6, 10, 'main')
        m.box(1, 3, 2, 4, 3, 5, 'light')
    elif feature == 'fox':
        m.box(7, 9, 1, 2, 6, 8, 'main').box(7, 9, 4, 5, 6, 8, 'main')
        m.box(0, 3, 2, 4, 3, 5, 'main').box(0, 1, 2, 4, 3, 5, 'light')
        m.box(3, 7, 1, 2, 2, 3, 'light')
    else:
        m.box(8, 11, 2, 4, 3, 5, 'main').box(10, 11, 2, 4, 0, 4, 'main')
        m.box(7, 9, 0, 1, 4, 6, 'accent').box(7, 9, 5, 6, 4, 6, 'accent')
        m.box(7, 8, 1, 2, 5, 6, 'light').box(7, 8, 4, 5, 5, 6, 'light')
        m.box(4, 7, 0, 1, 3, 6, 'main').box(4, 7, 5, 6, 3, 6, 'main')
    return m

animal('rabbit', 'Rabbit', 1, '#E8D6C1', '#F2A7A7', 'rabbit').save()
animal('fox', 'Fox', 2, '#D97535', '#E9AE67', 'fox').save()
animal('elephant', 'Elephant', 3, '#91A5AF', '#BAC5C9', 'elephant').save()

m = Model('cherry', 'Cherry', 'fruit', 1, 'Build a pair of bright red cherries.',
          dict(red='#D94050', shine='#F7777F', green='#428D5A', dark='#69472F'))
for x in (1, 5):
    m.box(x, x+3, 1, 4, 0, 3, 'red').box(x+1, x+2, 2, 3, 3, 5, 'green')
m.box(3, 6, 2, 3, 4, 5, 'green').box(4, 5, 2, 3, 5, 7, 'dark')
m.box(1, 2, 1, 2, 2, 3, 'shine').box(5, 6, 1, 2, 2, 3, 'shine')
m.save()

m = Model('watermelon', 'Watermelon', 'fruit', 2, 'Build a juicy watermelon slice.',
          dict(rind='#398B56', light='#B9D978', red='#F46669', seed='#27334D'))
m.box(0, 10, 1, 5, 0, 2, 'rind').box(1, 9, 1, 5, 2, 3, 'light')
m.box(2, 8, 1, 5, 3, 5, 'red').box(3, 7, 2, 4, 5, 6, 'red')
for x in (3, 5, 7): m.box(x, x+1, 1, 2, 4, 5, 'seed')
m.save()

m = Model('pear', 'Pear', 'fruit', 3, 'Build a rounded green pear.',
          dict(green='#99C957', shade='#6DA747', stem='#76523B', leaf='#3C9961', light='#D9ED9A'))
m.box(2, 8, 1, 7, 0, 2, 'shade').box(1, 9, 1, 7, 2, 5, 'green')
m.box(2, 8, 2, 6, 5, 7, 'green').box(3, 7, 2, 6, 7, 9, 'green')
m.box(4, 6, 3, 5, 9, 11, 'stem').box(5, 8, 3, 5, 10, 11, 'leaf')
m.box(2, 3, 1, 2, 4, 6, 'light')
m.save()

def bird(id, title, order, main, wing, feature):
    m = Model(id, title, 'bird', order, f'Build a colorful {title.lower()}.',
              dict(main=main, wing=wing, beak='#F5A740', dark='#27334D', light='#FFF7DE', feet='#D8783D'))
    m.box(2, 7, 2, 6, 1, 5, 'main').box(3, 6, 2, 6, 5, 8, 'main')
    m.box(2, 4, 1, 2, 2, 5, 'wing').box(5, 7, 6, 7, 2, 5, 'wing')
    m.box(3, 4, 2, 3, 0, 2, 'feet').box(5, 6, 5, 6, 0, 2, 'feet')
    m.box(6, 8, 3, 5, 5, 6, 'beak')
    m.box(5, 6, 2, 3, 6, 7, 'dark').box(5, 6, 5, 6, 6, 7, 'dark')
    if feature == 'chick': m.box(3, 5, 3, 5, 8, 9, 'main')
    if feature == 'owl':
        m.box(3, 4, 2, 3, 7, 9, 'wing').box(5, 6, 5, 6, 7, 9, 'wing')
        m.box(4, 5, 2, 3, 6, 7, 'light').box(4, 5, 5, 6, 6, 7, 'light')
        m.box(5, 6, 2, 3, 6, 7, 'dark').box(5, 6, 5, 6, 6, 7, 'dark')
    if feature == 'parrot':
        m.box(1, 3, 3, 5, 2, 6, 'wing').box(0, 2, 3, 5, 0, 4, 'wing')
        m.box(3, 6, 2, 6, 7, 9, 'wing').box(6, 9, 3, 5, 5, 6, 'beak')
    return m

bird('chick', 'Chick', 1, '#F8D957', '#E9BA42', 'chick').save()
bird('owl', 'Owl', 2, '#9B6C4D', '#704C3B', 'owl').save()
bird('parrot', 'Parrot', 3, '#51B884', '#DE5C4C', 'parrot').save()

def car(id, title, order, body, roof, kind):
    m = Model(id, title, 'car', order, f'Build a brick-built {title.lower()}.',
              dict(body=body, roof=roof, glass='#91D5E0', tire='#30384B', hub='#C9D2D5', light='#FFECA1'))
    length = {'compact': 9, 'pickup': 11, 'race': 12}[kind]
    m.box(0, length, 2, 7, 1, 4, 'body')
    for x in (1, length-3):
        for y in (1, 7):
            m.box(x, x+2, y, y+2, 0, 3, 'tire').box(x, x+2, y, y+2, 1, 2, 'hub')
    if kind == 'compact':
        m.box(2, 7, 3, 6, 4, 6, 'roof').box(3, 6, 2, 3, 4, 5, 'glass')
    elif kind == 'pickup':
        m.box(5, 10, 3, 6, 4, 7, 'roof').box(6, 9, 2, 3, 4, 6, 'glass')
        m.box(0, 5, 2, 7, 4, 5, 'body').box(0, 1, 2, 7, 5, 6, 'body')
    else:
        m.box(3, 9, 3, 6, 4, 5, 'roof').box(5, 8, 2, 3, 4, 5, 'glass')
        m.box(3, 10, 2, 3, 3, 4, 'roof').box(3, 10, 6, 7, 3, 4, 'roof')
        m.box(0, 2, 1, 8, 3, 4, 'roof').box(10, 12, 1, 8, 3, 4, 'roof')
        m.box(0, 2, 0, 9, 4, 6, 'roof')
    m.box(length-1, length, 3, 6, 2, 3, 'light')
    return m

car('compact-car', 'Compact Car', 1, '#68B9D7', '#4D8FAA', 'compact').save()
car('pickup-truck', 'Pickup Truck', 2, '#E08057', '#B65B47', 'pickup').save()
car('race-car', 'Race Car', 3, '#DE4E57', '#F1B954', 'race').save()

m = Model('fish', 'Fish', 'ocean', 1, 'Build a bright tropical fish.',
          dict(body='#F5B94D', fin='#EE7653', stripe='#FFF2C3', eye='#243248'))
m.box(2, 8, 2, 6, 1, 5, 'body').box(0, 3, 2, 6, 0, 6, 'fin')
m.box(4, 6, 2, 6, 1, 5, 'stripe').box(5, 7, 3, 5, 5, 7, 'fin')
m.box(7, 8, 2, 3, 3, 4, 'eye').box(7, 8, 5, 6, 3, 4, 'eye')
m.save()

m = Model('sea-turtle', 'Sea Turtle', 'ocean', 2, 'Build a sea turtle with a patterned shell.',
          dict(shell='#4D936E', pattern='#8BC777', skin='#77B9A4', eye='#27334D'))
m.box(2, 9, 2, 8, 1, 4, 'shell').box(3, 8, 3, 7, 4, 6, 'pattern')
m.box(8, 11, 3, 7, 0, 4, 'skin').box(10, 11, 3, 4, 2, 3, 'eye')
for x in (2, 7):
    m.box(x, x+2, 0, 3, 0, 2, 'skin').box(x, x+2, 7, 10, 0, 2, 'skin')
m.box(0, 3, 4, 6, 0, 2, 'skin')
m.save()

m = Model('shark', 'Shark', 'ocean', 3, 'Build a shark with a tall dorsal fin.',
          dict(body='#718FA2', belly='#DDE7E6', fin='#526D84', eye='#27334D', mouth='#3E5260'))
m.box(3, 12, 2, 7, 1, 5, 'body').box(4, 11, 2, 7, 1, 2, 'belly')
m.box(0, 4, 3, 6, 0, 6, 'fin').box(7, 10, 3, 6, 5, 8, 'fin')
m.box(6, 9, 0, 3, 1, 3, 'fin').box(6, 9, 6, 9, 1, 3, 'fin')
m.box(11, 13, 3, 6, 1, 4, 'body').box(11, 12, 2, 3, 3, 4, 'eye')
m.box(11, 13, 3, 6, 1, 2, 'mouth')
m.save()

def dino(id, title, order, body, accent, kind):
    m = Model(id, title, 'dinosaur', order, f'Build a {title.lower()} from colorful bricks.',
              dict(body=body, accent=accent, dark='#26364A', belly='#D5D7A5', horn='#EFE3B5'))
    if kind == 't-rex':
        m.box(3, 13, 2, 7, 3, 7, 'body')
        for x in (4, 9):
            for y in (2, 6): m.box(x, x+2, y, y+1, 0, 4, 'body')
        m.box(0, 4, 3, 6, 1, 5, 'body').box(0, 2, 3, 6, 0, 3, 'body')
        m.box(10, 13, 3, 6, 5, 9, 'body').box(11, 14, 3, 6, 7, 10, 'body')
        m.box(12, 14, 3, 6, 7, 8, 'belly').box(13, 15, 3, 6, 8, 9, 'body')
        m.box(12, 13, 3, 4, 9, 10, 'dark').box(12, 13, 5, 6, 9, 10, 'dark')
        m.box(9, 12, 1, 3, 4, 6, 'body').box(9, 12, 6, 8, 4, 6, 'body')
        m.box(4, 9, 2, 3, 6, 7, 'accent').box(4, 9, 6, 7, 6, 7, 'accent')
        return m
    m.box(3, 10, 2, 7, 3, 7, 'body')
    for x in (4, 8):
        for y in (2, 6): m.box(x, x+2, y, y+1, 0, 4, 'body')
    m.box(9, 12, 3, 6, 5, 9, 'body').box(11, 14, 3, 6, 7, 9, 'body')
    m.box(12, 13, 2, 3, 8, 9, 'dark').box(12, 13, 6, 7, 8, 9, 'dark')
    m.box(1, 4, 3, 6, 3, 6, 'body').box(0, 2, 3, 6, 2, 4, 'body')
    if kind == 'stegosaurus':
        for x, top in ((3, 9), (5, 10), (7, 11), (9, 10)):
            m.box(x, x+2, 3, 6, 7, top, 'accent')
        m.box(0, 2, 2, 3, 2, 4, 'accent')
    elif kind == 'triceratops':
        m.box(9, 12, 2, 7, 8, 10, 'accent')
        m.box(11, 12, 2, 3, 9, 11, 'horn').box(11, 12, 6, 7, 9, 11, 'horn')
        m.box(13, 14, 4, 5, 8, 10, 'horn')
    return m

dino('stegosaurus', 'Stegosaurus', 1, '#90B86D', '#E7A86D', 'stegosaurus').save()
dino('triceratops', 'Triceratops', 2, '#A0A17C', '#C58D68', 'triceratops').save()
dino('t-rex', 'T. rex', 3, '#739B64', '#B6B962', 't-rex').save()
