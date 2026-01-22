import { useState, useEffect } from 'react';

/**
 * Hook to detect if a modifier key (like Alt/Option) is currently pressed.
 * Default is 'Alt' which corresponds to Option on macOS.
 */
export function useModifierKey(targetKey: string = 'Alt') {
    const [isPressed, setIsPressed] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === targetKey) {
                setIsPressed(true);
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === targetKey) {
                setIsPressed(false);
            }
        };

        // Reset when window loses focus to avoid stuck states
        const handleBlur = () => {
            setIsPressed(false);
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', handleBlur);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', handleBlur);
        };
    }, [targetKey]);

    return isPressed;
}
