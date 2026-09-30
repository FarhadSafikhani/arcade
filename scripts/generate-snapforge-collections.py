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
        # Collapse identical vertical stacks into the three supported h4 footprints.
        for bottom in sorted(bricks[:], key=lambda brick: brick['z']):
            if bottom not in bricks or bottom['w'] > 2 or bottom['d'] > 2 or bottom.get('h', 1) > 2:
                continue
            stack = [bottom]
            height = bottom.get('h', 1)
            while height < 4:
                above = next((brick for brick in bricks if brick not in stack
                              and all(brick[field] == bottom[field] for field in ('x', 'y', 'w', 'd', 'color'))
                              and brick['z'] == bottom['z'] + height and brick.get('h', 1) <= 2), None)
                if above is None: break
                stack.append(above)
                height += above.get('h', 1)
            if height == 4 and len(stack) > 1:
                bottom['h'] = 4
                for brick in stack[1:]: bricks.remove(brick)
        bricks.sort(key=lambda brick: (brick['z'], brick['y'], brick['x']))
        for i, b in enumerate(bricks, 1):
            b['id'] = f'brick-{i:03}'
        return bricks

    def save(self):
        path = OUT / f'{self.id}.json'
        # A migrated model belongs to the recipe compiler, never this legacy generator.
        if (OUT.parent / 'recipes' / f'{self.id}.json').exists():
            print(f'Skipping recipe-owned model: {self.id}')
            return
        previous = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
        bricks = self.bricks()
        data = dict(id=self.id, title=self.title, description=self.description,
                    collection=self.collection, order=self.order, version=previous.get('version', 1),
                    palette=self.palette, bricks=bricks,
                    targetParts=previous.get('targetParts', len(bricks)), vetted=0)
        if previous and (previous.get('bricks') != bricks or previous.get('palette') != self.palette):
            raise ValueError(f'{self.id}: legacy geometry changed; migrate to a recipe and increment version')
        data['vetted'] = previous.get('vetted', 0)
        path.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
        print(f'{self.collection:12} {self.title:16} {len(data["bricks"]):3} bricks')

# Safari Collection is authored entirely by recipes. Retired animals are not regenerated.

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

# Bird Collection is authored entirely through recipes.

# Car Collection is authored entirely through recipes.

# Ocean models are recipe-authored; retired Fish, Sea Turtle, and Shark stay removed.

# Retired dinosaur models will be remade as recipes. Do not regenerate them.
