import os
import argparse

# --- CONFIGURATION ---
# Directories to ignore
IGNORE_DIRS = {
    'node_modules', 'dist', '.git', '.angular', '.vscode', '.idea', 'coverage'
}

# Files to ignore (exact matches)
IGNORE_FILES = {
    'package-lock.json', 'yarn.lock', '.DS_Store', 'favicon.ico'
}

# File extensions to ignore (binary files, images, etc.)
IGNORE_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', 
    '.ttf', '.woff', '.woff2', '.eot', '.mp4', '.pdf', 
    '.exe', '.dll', '.so', '.dylib', '.class', '.jar'
}

def generate_tree(startpath):
    """Generates a visual tree structure of the project."""
    tree_str = "### PROJECT STRUCTURE ###\n\n"
    for root, dirs, files in os.walk(startpath):
        # Filter directories in-place
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        
        level = root.replace(startpath, '').count(os.sep)
        indent = ' ' * 4 * (level)
        tree_str += f"{indent}{os.path.basename(root)}/\n"
        subindent = ' ' * 4 * (level + 1)
        for f in files:
            if f not in IGNORE_FILES and os.path.splitext(f)[1] not in IGNORE_EXTENSIONS:
                tree_str += f"{subindent}{f}\n"
    return tree_str + "\n"

def generate_prompt(startpath):
    """Reads files and formats them into a prompt."""
    output = []
    
    # 1. Add the Project Tree
    output.append(generate_tree(startpath))
    
    output.append("### FILE CONTENTS ###\n")

    # 2. Walk through files and add content
    for root, dirs, files in os.walk(startpath):
        # Filter directories
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]

        for file in files:
            file_path = os.path.join(root, file)
            ext = os.path.splitext(file)[1]

            if file in IGNORE_FILES or ext in IGNORE_EXTENSIONS:
                continue

            # Relative path for readability
            rel_path = os.path.relpath(file_path, startpath)

            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                # Format: Name of file, then code block
                output.append(f"--- START OF FILE: {rel_path} ---")
                output.append(f"```typescript") # Defaulting to ts syntax highlighting for readability
                output.append(content)
                output.append(f"```")
                output.append(f"--- END OF FILE: {rel_path} ---\n")
                
            except Exception as e:
                print(f"Skipping file {rel_path} due to read error: {e}")

    return "\n".join(output)

def main():
    parser = argparse.ArgumentParser(description="Convert Angular project to LLM Prompt")
    parser.add_argument("path", nargs="?", default=".", help="Path to the Angular project (default: current folder)")
    parser.add_argument("-o", "--output", default="project_context.txt", help="Output file name (default: project_context.txt)")
    
    args = parser.parse_args()
    
    project_path = os.path.abspath(args.path)
    
    if not os.path.exists(project_path):
        print(f"Error: Path '{project_path}' does not exist.")
        return

    print(f"Scanning project at: {project_path}")
    print("Generating prompt...")
    
    full_prompt = generate_prompt(project_path)
    
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(full_prompt)
        
    print(f"✅ Success! Prompt saved to: {args.output}")
    print(f"📊 Approximate Token Count: {len(full_prompt) // 4}")

if __name__ == "__main__":
    main()