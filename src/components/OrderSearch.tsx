import { useState, type KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';

export type SearchableOrder = { orderId: string; name: string; platform: string; deal: string };

export function matchesOrder(order: SearchableOrder, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  return [order.orderId, order.name, order.platform, order.deal].some((value) => value.toLowerCase().includes(term));
}

export function OrderSearch({ orders, onSearch }: { orders: SearchableOrder[]; onSearch: (query: string) => void }) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const suggestions = input.trim() ? orders.filter((order) => matchesOrder(order, input)).slice(0, 6) : [];
  const showList = open && suggestions.length > 0;

  const run = (value: string) => {
    setInput(value);
    setOpen(false);
    setActive(-1);
    onSearch(value.trim());
  };

  const clear = () => run('');

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && showList) {
      event.preventDefault();
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp' && showList) {
      event.preventDefault();
      setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(showList && active >= 0 ? suggestions[active].orderId : input);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="order-search">
      <div className="search-field">
        <Search size={16} />
        <input
          role="combobox"
          aria-expanded={showList}
          aria-autocomplete="list"
          placeholder="Search order ID, name, platform or deal"
          value={input}
          onChange={(event) => { setInput(event.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {input && <button type="button" aria-label="Clear search" onClick={clear}><X size={14} /></button>}
      </div>
      {showList && (
        <ul className="search-suggestions" role="listbox">
          {suggestions.map((order, index) => (
            <li
              key={order.orderId}
              role="option"
              aria-selected={index === active}
              className={index === active ? 'active' : ''}
              onMouseDown={(event) => { event.preventDefault(); run(order.orderId); }}
            >
              <strong>{order.orderId}</strong>
              <span>{order.name} · {order.platform} · {order.deal}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
