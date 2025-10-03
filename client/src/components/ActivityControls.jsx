import { Show } from 'solid-js';

export function ActivityControls(props) {
  const isOwner = () => props.wsManager?.userHash === props.activity?.ownerId;
  
  return (
    <Show when={isOwner()}>
      <div class="absolute top-4 right-4 flex flex-col gap-2 animate-slide-down">
        {/* Toggle Select Mode Button */}
        <button
          onClick={props.onToggleSelectMode}
          class={`px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-lg ${
            props.selectMode 
              ? 'bg-orange-500 hover:bg-orange-600 text-white' 
              : 'bg-gray-700/90 hover:bg-gray-700 text-white backdrop-blur'
          }`}
        >
          {props.selectMode ? 'Exit Review Mode' : 'Review Contributions'}
        </button>
        
        {/* Remove Selected Button */}
        <Show when={props.selectMode && props.selectedPaths.size > 0}>
          <button
            onClick={props.onRemoveSelected}
            class="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-all duration-200 shadow-lg animate-scale-in"
          >
            Remove Selected ({props.selectedPaths.size})
          </button>
        </Show>
        
        {/* Review Mode Instructions */}
        <Show when={props.selectMode}>
          <div class="bg-gray-800/90 backdrop-blur text-white text-sm p-3 rounded-lg shadow-lg max-w-xs animate-fade-in">
            <p class="font-semibold mb-1">Review Mode Active</p>
            <p class="text-gray-300">Click on drawings to select them for removal. Your own drawings are dimmed.</p>
          </div>
        </Show>
      </div>
    </Show>
  );
}