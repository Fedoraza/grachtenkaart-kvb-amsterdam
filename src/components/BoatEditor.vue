<template>
  <form class="grid gap-2 rounded-2xl border border-sky-300/25 bg-sky-400/10 p-3 sm:grid-cols-2" @submit.prevent="submit">
    <div class="flex items-center justify-between sm:col-span-2">
      <strong>{{ boat ? `Editing ${boat.name}` : 'Add a new boat' }}</strong>
      <span class="text-[10px] font-bold uppercase tracking-wider text-sky-300">Edit mode</span>
    </div>
    <input v-model="form.name" required class="fleet-input" placeholder="Boat name" />
    <input v-model="form.mmsi" class="fleet-input" inputmode="numeric" maxlength="9" placeholder="MMSI" />
    <input v-model="form.registration" class="fleet-input" placeholder="Registration" />
    <input v-model="form.capacity" class="fleet-input" inputmode="numeric" placeholder="Passenger capacity" />
    <input v-model="form.boatType" class="fleet-input" placeholder="Boat type" />
    <input v-model="form.licenseRequired" class="fleet-input" placeholder="Required licence" />
    <input v-model="form.lengthM" class="fleet-input" inputmode="decimal" placeholder="Length in metres" />
    <input v-model="form.widthM" class="fleet-input" inputmode="decimal" placeholder="Width in metres" />
    <input v-model="form.propulsion" class="fleet-input" placeholder="Propulsion" />
    <label class="grid gap-1 text-xs font-bold text-slate-300">
      Home harbour
      <select v-model="dockChoice" class="fleet-input dock-select" required aria-label="Home harbour">
        <option disabled value="">Choose a home harbour…</option>
        <option value="EH">EH</option>
        <option value="Staverno">Staverno</option>
        <option value="other">Other — define a name</option>
      </select>
    </label>
    <label v-if="dockChoice === 'other'" class="grid gap-1 text-xs font-bold text-slate-300">
      Other harbour name
      <input v-model.trim="customDock" class="fleet-input" required maxlength="100" placeholder="Enter harbour name" />
    </label>
    <select v-model="form.nicenessRating" class="fleet-input">
      <option value="">Niceness rating (not rated)</option>
      <option v-for="rating in ['S', 'A', 'B', 'C', 'D', 'E', 'F']" :key="rating" :value="rating">{{ rating }} rating</option>
    </select>
    <label class="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm">
      <input v-model="form.openBoat" type="checkbox" /> Open boat
    </label>
    <label class="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm">
      <input v-model="form.hasToilet" type="checkbox" /> Has toilet
    </label>
    <label class="cursor-pointer rounded-lg border border-dashed border-white/20 px-3 py-2 text-sm text-slate-300 hover:bg-white/5">
      {{ photo?.name || (boat?.photoUrl ? 'Replace boat photo' : 'Choose boat photo') }}
      <input class="hidden" type="file" accept="image/jpeg,image/png,image/webp" @change="selectPhoto" />
    </label>
    <textarea v-model="form.notes" class="fleet-input min-h-20 sm:col-span-2" placeholder="Operational notes"></textarea>
    <div class="flex gap-2 sm:col-span-2">
      <button class="flex-1 rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold hover:bg-sky-400">Save changes</button>
      <button type="button" class="rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/20" @click="$emit('cancel')">Cancel</button>
    </div>
  </form>
</template>

<script setup>
import { reactive, ref } from 'vue'

const props = defineProps({ boat: { type: Object, default: null } })
const emit = defineEmits(['save', 'cancel'])
const photo = ref(null)
const savedDock = props.boat?.home_dock || ''
const dockChoice = ref(['EH', 'Staverno'].includes(savedDock) ? savedDock : savedDock ? 'other' : '')
const customDock = ref(dockChoice.value === 'other' ? savedDock : '')
const form = reactive({
  id: props.boat?.id || null,
  name: props.boat?.name || '',
  mmsi: props.boat?.mmsi || '',
  registration: props.boat?.registration || '',
  capacity: props.boat?.capacity ?? '',
  notes: props.boat?.notes || '',
  licenseRequired: props.boat?.license_required || '',
  openBoat: Boolean(props.boat?.open_boat),
  lengthM: props.boat?.length_m ?? '',
  widthM: props.boat?.width_m ?? '',
  boatType: props.boat?.boat_type || '',
  propulsion: props.boat?.propulsion || '',
  homeDock: props.boat?.home_dock || '',
  hasToilet: Boolean(props.boat?.has_toilet),
  nicenessRating: props.boat?.niceness_rating || '',
})

function selectPhoto(event) {
  photo.value = event.target.files?.[0] || null
}

function submit() {
  emit('save', { ...form, homeDock: dockChoice.value === 'other' ? customDock.value : dockChoice.value }, photo.value)
}
</script>

<style scoped>
.fleet-input {
  border: 1px solid rgb(255 255 255 / 0.15);
  border-radius: 0.5rem;
  background: rgb(255 255 255 / 0.05);
  color: white;
  font-size: 0.875rem;
  outline: none;
  padding: 0.55rem 0.7rem;
  width: 100%;
}

.fleet-input::placeholder { color: rgb(148 163 184); }
.dock-select { appearance: auto; cursor: pointer; }
</style>
